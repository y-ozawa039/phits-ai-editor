import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function normalizeLicense(pkg) {
  if (typeof pkg.license === "string" && pkg.license.trim()) return pkg.license.trim();
  if (Array.isArray(pkg.licenses)) {
    const values = pkg.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter(Boolean);
    if (values.length > 0) return values.join(" OR ");
  }
  return "UNKNOWN — review required";
}

function readPackage(packageDirectory, packages) {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
    if (pkg.name && pkg.version) {
      packages.set(`${pkg.name}@${pkg.version}`, {
        ecosystem: "npm",
        name: pkg.name,
        version: pkg.version,
        license: normalizeLicense(pkg),
      });
    }
  } catch {
    // pnpm store entries do not all expose a package at every traversed path.
  }
}

export function collectNodePackages(projectRoot) {
  const storeRoot = join(projectRoot, "node_modules", ".pnpm");
  const packages = new Map();

  for (const storeEntry of readdirSync(storeRoot, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) continue;
    const modulesDirectory = join(storeRoot, storeEntry.name, "node_modules");
    let moduleEntries;
    try {
      moduleEntries = readdirSync(modulesDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const moduleEntry of moduleEntries) {
      const modulePath = join(modulesDirectory, moduleEntry.name);
      if (moduleEntry.name.startsWith("@")) {
        try {
          for (const scopedEntry of readdirSync(modulePath, { withFileTypes: true })) {
            readPackage(join(modulePath, scopedEntry.name), packages);
          }
        } catch {
          // Ignore broken optional dependency links.
        }
      } else {
        readPackage(modulePath, packages);
      }
    }
  }

  return [...packages.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
}

export function collectRustPackages(projectRoot) {
  try {
    const metadataText = execFileSync(
      "cargo",
      [
        "metadata",
        "--offline",
        "--format-version",
        "1",
        "--filter-platform",
        "x86_64-pc-windows-msvc",
        "--manifest-path",
        join(projectRoot, "src-tauri", "Cargo.toml"),
      ],
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const metadata = JSON.parse(metadataText);
    return metadata.packages
      .filter((pkg) => pkg.source)
      .map((pkg) => ({
        ecosystem: "cargo",
        name: pkg.name,
        version: pkg.version,
        license:
          pkg.license ||
          (pkg.license_file ? `SEE LICENSE FILE: ${pkg.license_file}` : "UNKNOWN — review required"),
      }))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
      );
  } catch (error) {
    console.warn(`cargo metadata was unavailable; using Cargo.lock fallback: ${error.message}`);
  }

  const lockText = readFileSync(join(projectRoot, "src-tauri", "Cargo.lock"), "utf8");
  const registryRoot = join(process.env.USERPROFILE ?? "", ".cargo", "registry", "src");
  let registries = [];
  try {
    registries = readdirSync(registryRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(registryRoot, entry.name));
  } catch {
    // Missing Cargo registry will be reported as unknown licenses below.
  }

  const packages = [];
  for (const block of lockText.split(/\r?\n\[\[package\]\]\r?\n/).slice(1)) {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const source = block.match(/^source\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version || !source?.startsWith("registry+")) continue;

    let license = "UNKNOWN — review required";
    for (const registry of registries) {
      try {
        const manifest = readFileSync(join(registry, `${name}-${version}`, "Cargo.toml"), "utf8");
        const declaredLicense = manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
        const licenseFile = manifest.match(/^license-file\s*=\s*"([^"]+)"/m)?.[1];
        license = declaredLicense || (licenseFile ? `SEE LICENSE FILE: ${licenseFile}` : license);
        break;
      } catch {
        // Try the next configured registry source directory.
      }
    }

    packages.push({ ecosystem: "cargo", name, version, license });
  }

  return packages.sort(
    (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
}

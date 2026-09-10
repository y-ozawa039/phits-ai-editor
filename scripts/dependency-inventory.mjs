import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const WINDOWS_X64_TARGET = Object.freeze({ os: "win32", cpu: "x64" });

function targetFieldAllows(value, target) {
  if (value == null) return true;
  const entries = (Array.isArray(value) ? value : [value]).filter(
    (entry) => typeof entry === "string" && entry.length > 0,
  );
  if (entries.some((entry) => entry === `!${target}`)) return false;
  const allowed = entries.filter((entry) => !entry.startsWith("!"));
  return allowed.length === 0 || allowed.includes("any") || allowed.includes(target);
}

export function packageSupportsTarget(pkg, target = WINDOWS_X64_TARGET) {
  return targetFieldAllows(pkg.os, target.os) && targetFieldAllows(pkg.cpu, target.cpu);
}

function collectLockedNodePackageKeys(projectRoot) {
  const lockText = readFileSync(join(projectRoot, "pnpm-lock.yaml"), "utf8");
  const packagesStart = lockText.search(/^packages:\s*$/m);
  const snapshotsStart = lockText.search(/^snapshots:\s*$/m);
  if (packagesStart < 0 || snapshotsStart < 0 || snapshotsStart <= packagesStart) {
    throw new Error("pnpm-lock.yaml does not contain packages and snapshots sections");
  }
  const packageSection = lockText.slice(packagesStart, snapshotsStart);
  const keys = new Set();
  for (const match of packageSection.matchAll(/^  (.+):\s*$/gm)) {
    let key = match[1].trim();
    if (
      (key.startsWith("'") && key.endsWith("'")) ||
      (key.startsWith('"') && key.endsWith('"'))
    ) {
      key = key.slice(1, -1);
    }
    keys.add(key);
  }
  return keys;
}

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

function normalizeRepository(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;
  if (!value) return undefined;
  return value
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function readPackage(packageDirectory, packages, lockedKeys, target) {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
    const identity = pkg.name && pkg.version ? `${pkg.name}@${pkg.version}` : undefined;
    if (identity && lockedKeys.has(identity) && packageSupportsTarget(pkg, target)) {
      packages.set(`${pkg.name}@${pkg.version}`, {
        ecosystem: "npm",
        name: pkg.name,
        version: pkg.version,
        license: normalizeLicense(pkg),
        packageDirectory,
        sourceUrl:
          normalizeRepository(pkg.repository) ||
          pkg.homepage ||
          `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
      });
    }
  } catch {
    // pnpm store entries do not all expose a package at every traversed path.
  }
}

export function collectNodePackages(projectRoot, target = WINDOWS_X64_TARGET) {
  const storeRoot = join(projectRoot, "node_modules", ".pnpm");
  const packages = new Map();
  const lockedKeys = collectLockedNodePackageKeys(projectRoot);

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
            readPackage(join(modulePath, scopedEntry.name), packages, lockedKeys, target);
          }
        } catch {
          // Ignore broken optional dependency links.
        }
      } else {
        readPackage(modulePath, packages, lockedKeys, target);
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
        packageDirectory: dirname(pkg.manifest_path),
        licenseFile: pkg.license_file || undefined,
        sourceUrl: pkg.repository || pkg.homepage || `https://crates.io/crates/${pkg.name}/${pkg.version}`,
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
    let packageDirectory;
    let licenseFile;
    let sourceUrl = `https://crates.io/crates/${name}/${version}`;
    for (const registry of registries) {
      try {
        packageDirectory = join(registry, `${name}-${version}`);
        const manifest = readFileSync(join(packageDirectory, "Cargo.toml"), "utf8");
        const declaredLicense = manifest.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
        const declaredLicenseFile = manifest.match(/^license-file\s*=\s*"([^"]+)"/m)?.[1];
        const repository = manifest.match(/^repository\s*=\s*"([^"]+)"/m)?.[1];
        const homepage = manifest.match(/^homepage\s*=\s*"([^"]+)"/m)?.[1];
        licenseFile = declaredLicenseFile ? join(packageDirectory, declaredLicenseFile) : undefined;
        sourceUrl = repository || homepage || sourceUrl;
        license = declaredLicense || (declaredLicenseFile ? `SEE LICENSE FILE: ${declaredLicenseFile}` : license);
        break;
      } catch {
        // Try the next configured registry source directory.
      }
    }

    packages.push({
      ecosystem: "cargo",
      name,
      version,
      license,
      packageDirectory,
      licenseFile,
      sourceUrl,
    });
  }

  return packages.sort(
    (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
}

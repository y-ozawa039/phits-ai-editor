import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

function normalizeLicense(pkg) {
  if (typeof pkg.license === "string" && pkg.license.trim()) {
    return pkg.license.trim();
  }

  if (Array.isArray(pkg.licenses)) {
    const values = pkg.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter(Boolean);
    if (values.length > 0) {
      return values.join(" OR ");
    }
  }

  return "UNKNOWN — review required";
}

function readPackage(packageDirectory, packages) {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
    if (pkg.name && pkg.version) {
      packages.set(`${pkg.name}@${pkg.version}`, {
        name: pkg.name,
        version: pkg.version,
        license: normalizeLicense(pkg),
      });
    }
  } catch {
    // pnpm store entries do not all expose a package at every traversed path.
  }
}

function collectNodePackages() {
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

function collectRustPackages() {
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

    packages.push({ name, version, license });
  }

  return packages
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
    );
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderTable(packages, registry) {
  const lines = ["| Package | Version | Declared license |", "| --- | --- | --- |"];
  for (const pkg of packages) {
    const href =
      registry === "npm"
        ? `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`
        : `https://crates.io/crates/${pkg.name}/${pkg.version}`;
    lines.push(
      `| [${escapeCell(pkg.name)}](${href}) | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license)} |`,
    );
  }
  return lines.join("\n");
}

const nodePackages = collectNodePackages();
const rustPackages = collectRustPackages();
const unknowns = [...nodePackages, ...rustPackages].filter((pkg) => pkg.license.startsWith("UNKNOWN"));

const output = `# Third-party notices

PHITS AI Editor depends on third-party open-source software. Each dependency
remains subject to its own license; the project's Apache-2.0 license does not
replace or override those terms.

This inventory is generated from the installed pnpm graph and Cargo metadata by
running \`pnpm licenses:generate\`. It includes development dependencies as well
as runtime dependencies so that source and binary release reviews use one
conservative list. Release packaging must also preserve any license texts,
copyright notices, and attribution files required by the dependencies actually
distributed.

## Generated Codex protocol schemas

\`schemas/codex/0.153.1\` contains compatibility-test schemas
generated from OpenAI Codex CLI 0.153.1. OpenAI Codex is licensed under the
[Apache License 2.0](https://github.com/openai/codex/blob/main/LICENSE).
Codex CLI itself is not bundled with PHITS AI Editor.

## JavaScript and TypeScript packages (${nodePackages.length})

${renderTable(nodePackages, "npm")}

## Rust crates (${rustPackages.length})

${renderTable(rustPackages, "cargo")}

## Audit status

${
  unknowns.length === 0
    ? "No installed package in this generated inventory has a missing declared license."
    : `The following ${unknowns.length} package(s) require manual license review before distribution: ${unknowns.map((pkg) => `\`${pkg.name}@${pkg.version}\``).join(", ")}.`
}

PHITS, Codex CLI, user credentials, and user input/output files are external to
this dependency inventory and are not distributed as part of this project.
`;

writeFileSync(join(projectRoot, "THIRD_PARTY_NOTICES.md"), output, "utf8");
console.log(
  `Wrote THIRD_PARTY_NOTICES.md (${nodePackages.length} npm packages, ${rustPackages.length} Rust crates, ${unknowns.length} unknown licenses).`,
);

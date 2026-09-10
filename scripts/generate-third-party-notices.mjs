import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectNodePackages, collectRustPackages } from "./dependency-inventory.mjs";
import {
  auditLicensePolicy,
  collectProductionNodePackageKeys,
  isMplLicensed,
  nodePackageScope,
  packageIdentity,
  renderLicenseBundle,
  selectDistributedPackages,
} from "./license-compliance.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderTable(packages, registry, productionNodeKeys) {
  const lines = [
    "| Package | Version | Declared license | Distribution scope |",
    "| --- | --- | --- | --- |",
  ];
  for (const pkg of packages) {
    const href =
      registry === "npm"
        ? `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`
        : `https://crates.io/crates/${pkg.name}/${pkg.version}`;
    const scope =
      registry === "npm"
        ? nodePackageScope(pkg, productionNodeKeys)
        : "Binary/build review (conservative)";
    lines.push(
      `| [${escapeCell(pkg.name)}](${href}) | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license)} | ${scope} |`,
    );
  }
  return lines.join("\n");
}

function renderMplSourceAvailability(packages) {
  if (packages.length === 0) return "No MPL-2.0 packages are included in the current review.";
  return packages
    .map(
      (pkg) =>
        `- [\`${pkg.name}@${pkg.version}\`](https://crates.io/crates/${pkg.name}/${pkg.version}) — [upstream source](${pkg.sourceUrl})`,
    )
    .join("\n");
}

const nodePackages = collectNodePackages(projectRoot);
const rustPackages = collectRustPackages(projectRoot);
const allPackages = [...nodePackages, ...rustPackages];
const productionNodeKeys = collectProductionNodePackageKeys(projectRoot);
const distributedPackages = selectDistributedPackages(allPackages, productionNodeKeys);
const { unknown, denied } = auditLicensePolicy(allPackages);
const licenseBundle = renderLicenseBundle(distributedPackages, projectRoot);
const mplPackages = distributedPackages.filter(isMplLicensed);
const caniuseLite = nodePackages.find((pkg) => pkg.name === "caniuse-lite");

const problems = [];
if (unknown.length > 0) {
  problems.push(`unknown license metadata: ${unknown.map(packageIdentity).join(", ")}`);
}
if (denied.length > 0) {
  problems.push(`denied license: ${denied.map(packageIdentity).join(", ")}`);
}
if (licenseBundle.missing.length > 0) {
  problems.push(
    `missing upstream license/notice files: ${licenseBundle.missing.map(packageIdentity).join(", ")}`,
  );
}
if (licenseBundle.staleOverrides.length > 0) {
  problems.push(`stale reviewed license overrides: ${licenseBundle.staleOverrides.join(", ")}`);
}
if (problems.length > 0) {
  throw new Error(`Third-party license generation failed:\n- ${problems.join("\n- ")}`);
}

const output = `# Third-party notices

PHITS AI Editor depends on third-party open-source software. Each dependency
remains subject to its own license; the project's Apache-2.0 license does not
replace or override those terms.

This inventory is generated from the pinned pnpm lockfile, installed package
metadata filtered for the official Windows x64 target, and Cargo metadata by
running \`pnpm licenses:generate\`. It includes development dependencies as well
as runtime dependencies so that source and binary release reviews use one
conservative list without depending on stale or host-specific pnpm store
entries. Packages used only to build or test the application are marked
separately from npm runtime dependencies. The corresponding upstream license,
copyright, and notice texts for packages included in the Windows binary review
are collected in \`THIRD_PARTY_LICENSES.txt\`.

Published packages that omit a repository-level license file are handled only
through the version-pinned, reviewed mappings in
\`third_party/license-overrides.json\`. A dependency version change invalidates
the mapping and requires a fresh review.

## Generated Codex protocol schemas

\`schemas/codex/0.153.1\` contains compatibility-test schemas
generated from OpenAI Codex CLI 0.153.1. OpenAI Codex is licensed under the
[Apache License 2.0](https://github.com/openai/codex/blob/main/LICENSE).
Codex CLI itself is not bundled with PHITS AI Editor.

## MPL-2.0 source availability

The following MPL-2.0 components are used unmodified through the Tauri/Rust
dependency graph. Their preferred source form is available from the exact
upstream version links below and remains licensed under MPL-2.0. PHITS AI
Editor's independently written source remains licensed under Apache-2.0.

${renderMplSourceAvailability(mplPackages)}

## Build-only attribution note

${
  caniuseLite
    ? `\`caniuse-lite@${caniuseLite.version}\` is present only through the frontend build/test toolchain. It is not a production npm dependency and is not shipped as a standalone runtime package. Its CC-BY-4.0 declaration remains recorded in the complete inventory below.`
    : "No caniuse-lite package is installed in the current dependency graph."
}

## JavaScript and TypeScript packages (${nodePackages.length})

${renderTable(nodePackages, "npm", productionNodeKeys)}

## Rust crates (${rustPackages.length})

${renderTable(rustPackages, "cargo", productionNodeKeys)}

## Audit status

No installed package in this generated inventory has a missing declared
license, a denied copyleft/source-available license, or a missing upstream
license/notice document for the packages included in the binary review.

PHITS, Codex CLI, user credentials, and user input/output files are external to
this dependency inventory and are not distributed as part of this project.
`;

writeFileSync(join(projectRoot, "THIRD_PARTY_NOTICES.md"), output, "utf8");
writeFileSync(join(projectRoot, "THIRD_PARTY_LICENSES.txt"), licenseBundle.text, "utf8");
console.log(
  `Wrote THIRD_PARTY_NOTICES.md and THIRD_PARTY_LICENSES.txt (${nodePackages.length} npm packages, ${rustPackages.length} Rust crates, ${licenseBundle.documentCount} unique license/notice documents).`,
);

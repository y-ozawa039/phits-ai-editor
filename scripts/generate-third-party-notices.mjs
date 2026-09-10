import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectNodePackages, collectRustPackages } from "./dependency-inventory.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

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

const nodePackages = collectNodePackages(projectRoot);
const rustPackages = collectRustPackages(projectRoot);
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

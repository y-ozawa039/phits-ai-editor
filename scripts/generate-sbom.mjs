import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectNodePackages, collectRustPackages } from "./dependency-inventory.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputPath = resolve(process.argv[2] ?? resolve(projectRoot, "SBOM.cdx.json"));
const app = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));

function purl(pkg) {
  if (pkg.ecosystem === "cargo") return `pkg:cargo/${encodeURIComponent(pkg.name)}@${pkg.version}`;
  const npmName = pkg.name.startsWith("@")
    ? `${pkg.name.slice(1).split("/").map(encodeURIComponent).join("/")}`
    : encodeURIComponent(pkg.name);
  return `pkg:npm/${npmName}@${pkg.version}`;
}

function component(pkg) {
  return {
    type: "library",
    name: pkg.name,
    version: pkg.version,
    purl: purl(pkg),
    licenses: [{ license: { name: pkg.license } }],
    properties: [{ name: "phits-ai-editor:ecosystem", value: pkg.ecosystem }],
  };
}

const dependencies = [
  ...collectNodePackages(projectRoot),
  ...collectRustPackages(projectRoot),
];
const unknowns = dependencies.filter((pkg) => pkg.license.startsWith("UNKNOWN"));
if (unknowns.length > 0) {
  throw new Error(`SBOM generation found ${unknowns.length} dependencies with unknown licenses.`);
}

const document = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    authors: [{ name: "Yohei Ozawa" }],
    component: {
      type: "application",
      name: "PHITS AI Editor",
      version: app.version,
      licenses: [{ license: { id: "Apache-2.0" } }],
    },
  },
  components: dependencies.map(component),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath} (${document.components.length} components).`);

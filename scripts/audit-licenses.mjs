import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectNodePackages, collectRustPackages } from "./dependency-inventory.mjs";
import {
  auditLicensePolicy,
  collectLicenseDocuments,
  collectProductionNodePackageKeys,
  packageIdentity,
  selectDistributedPackages,
} from "./license-compliance.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

const nodePackages = collectNodePackages(projectRoot);
const rustPackages = collectRustPackages(projectRoot);
const allPackages = [...nodePackages, ...rustPackages];
const productionNodeKeys = collectProductionNodePackageKeys(projectRoot);
const distributedPackages = selectDistributedPackages(allPackages, productionNodeKeys);
const { unknown, denied } = auditLicensePolicy(allPackages);
const { documents, missing, staleOverrides, reviewedOverrideCount } =
  collectLicenseDocuments(distributedPackages, projectRoot);

const problems = [];
if (unknown.length > 0) {
  problems.push(`Unknown licenses: ${unknown.map(packageIdentity).join(", ")}`);
}
if (denied.length > 0) {
  problems.push(`Denied licenses: ${denied.map(packageIdentity).join(", ")}`);
}
if (missing.length > 0) {
  problems.push(
    `Distributed packages without an upstream license/notice file: ${missing.map(packageIdentity).join(", ")}`,
  );
}
if (staleOverrides.length > 0) {
  problems.push(`Stale reviewed license overrides: ${staleOverrides.join(", ")}`);
}

const caniuseLite = nodePackages.find((pkg) => pkg.name === "caniuse-lite");
const caniuseLiteIsRuntime =
  caniuseLite &&
  distributedPackages.some(
    (pkg) =>
      pkg.ecosystem === "npm" &&
      pkg.name === caniuseLite.name &&
      pkg.version === caniuseLite.version,
  );
if (caniuseLiteIsRuntime) {
  problems.push("caniuse-lite unexpectedly entered the production dependency graph.");
}

const summary = {
  nodePackages: nodePackages.length,
  rustPackages: rustPackages.length,
  productionNodePackages: distributedPackages.filter((pkg) => pkg.ecosystem === "npm").length,
  conservativelyIncludedRustPackages: distributedPackages.filter(
    (pkg) => pkg.ecosystem === "cargo",
  ).length,
  uniqueLicenseDocuments: documents.length,
  unknownLicenses: unknown.length,
  deniedLicenses: denied.length,
  missingLicenseDocuments: missing.length,
  reviewedLicenseOverrides: reviewedOverrideCount,
  staleLicenseOverrides: staleOverrides.length,
  caniuseLiteScope: caniuseLite ? "build/test only" : "not installed",
};

console.log(JSON.stringify(summary, null, 2));
if (problems.length > 0) {
  throw new Error(`Third-party license audit failed:\n- ${problems.join("\n- ")}`);
}

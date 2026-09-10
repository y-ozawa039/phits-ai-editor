import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:$|[._-])/i;
const DENIED_LICENSE_PATTERNS = [
  /(?:^|[^A-Z])AGPL(?:[^A-Z]|$)/i,
  /(?:^|[^A-Z])LGPL(?:[^A-Z]|$)/i,
  /(?:^|[^A-Z])GPL(?:[^A-Z]|$)/i,
  /(?:^|[^A-Z])SSPL(?:[^A-Z]|$)/i,
  /(?:^|[^A-Z])BUSL(?:[^A-Z]|$)/i,
  /Elastic[- ]License/i,
  /Commons[- ]Clause/i,
  /PolyForm/i,
];

function packageKey(name, version) {
  return `${name}@${version}`;
}

function pnpmCommand() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath],
    };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm"],
    };
  }
  return { command: "pnpm", args: [] };
}

function visitPnpmDependencies(dependencies, keys) {
  for (const [name, dependency] of Object.entries(dependencies || {})) {
    if (!dependency?.version) continue;
    keys.add(packageKey(name, dependency.version));
    visitPnpmDependencies(dependency.dependencies, keys);
    visitPnpmDependencies(dependency.optionalDependencies, keys);
  }
}

export function collectProductionNodePackageKeys(projectRoot) {
  const invocation = pnpmCommand();
  const output = execFileSync(
    invocation.command,
    [...invocation.args, "list", "--prod", "--json", "--depth", "Infinity"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const projects = JSON.parse(output);
  const keys = new Set();
  for (const project of projects) {
    visitPnpmDependencies(project.dependencies, keys);
    visitPnpmDependencies(project.optionalDependencies, keys);
  }
  return keys;
}

export function auditLicensePolicy(packages) {
  const unknown = packages.filter(
    (pkg) => !pkg.license || /^(?:UNKNOWN|UNLICENSED|NONE|NOASSERTION)\b/i.test(pkg.license),
  );
  const denied = packages.filter((pkg) =>
    DENIED_LICENSE_PATTERNS.some((pattern) => pattern.test(pkg.license || "")),
  );
  return { unknown, denied };
}

function candidateLicenseFiles(pkg) {
  const paths = new Set();
  if (pkg.licenseFile && existsSync(pkg.licenseFile)) {
    paths.add(resolve(pkg.licenseFile));
  }
  if (!pkg.packageDirectory || !existsSync(pkg.packageDirectory)) return [...paths];

  for (const entry of readdirSync(pkg.packageDirectory, { withFileTypes: true })) {
    const entryPath = join(pkg.packageDirectory, entry.name);
    if (entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name)) {
      paths.add(resolve(entryPath));
    } else if (entry.isDirectory() && /^licenses?$/i.test(entry.name)) {
      for (const nested of readdirSync(entryPath, { withFileTypes: true })) {
        if (nested.isFile()) paths.add(resolve(join(entryPath, nested.name)));
      }
    }
  }
  return [...paths].sort();
}

function readLicenseText(path) {
  if (statSync(path).size > 1024 * 1024) {
    throw new Error(`License or notice file is unexpectedly large: ${path}`);
  }
  const bytes = readFileSync(path);
  if (bytes.includes(0)) {
    throw new Error(`License or notice file is not plain text: ${path}`);
  }
  return bytes.toString("utf8").replaceAll("\r\n", "\n").trimEnd();
}

function loadLicenseOverrides(projectRoot) {
  if (!projectRoot) return new Map();
  const manifestPath = join(projectRoot, "third_party", "license-overrides.json");
  if (!existsSync(manifestPath)) return new Map();

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || typeof manifest.packages !== "object") {
    throw new Error(`Unsupported third-party license override manifest: ${manifestPath}`);
  }
  return new Map(Object.entries(manifest.packages));
}

function assertProjectFile(projectRoot, file) {
  const path = resolve(projectRoot, file);
  const projectRelativePath = relative(projectRoot, path);
  if (
    projectRelativePath === "" ||
    projectRelativePath.startsWith("..") ||
    resolve(projectRoot, projectRelativePath) !== path
  ) {
    throw new Error(`License override escapes the project root: ${file}`);
  }
  return path;
}

function overrideLicenseFiles(pkg, packagesByIdentity, override, projectRoot) {
  if (!override.reviewedLicense || !override.reason || !Array.isArray(override.documents)) {
    throw new Error(`Incomplete reviewed license override: ${packageIdentity(pkg)}`);
  }

  return override.documents.map((document) => {
    if (document.package) {
      const provider = packagesByIdentity.get(document.package);
      if (!provider) {
        throw new Error(
          `License override provider ${document.package} is unavailable for ${packageIdentity(pkg)}`,
        );
      }
      const path = candidateLicenseFiles(provider).find(
        (candidate) => basename(candidate) === document.file,
      );
      if (!path) {
        throw new Error(
          `License override document ${document.file} is unavailable in ${document.package}`,
        );
      }
      return path;
    }
    if (!document.file || !projectRoot) {
      throw new Error(`Invalid reviewed license document for ${packageIdentity(pkg)}`);
    }
    const path = assertProjectFile(projectRoot, document.file);
    if (!existsSync(path)) {
      throw new Error(`Reviewed license document does not exist: ${document.file}`);
    }
    if (!document.source || !document.sha256) {
      throw new Error(`Reviewed license document lacks provenance: ${document.file}`);
    }
    const actualHash = createHash("sha256")
      .update(readLicenseText(path), "utf8")
      .digest("hex");
    if (actualHash !== document.sha256) {
      throw new Error(
        `Reviewed license document hash changed: ${document.file} (${actualHash})`,
      );
    }
    return path;
  });
}

export function collectLicenseDocuments(packages, projectRoot) {
  const documentsByHash = new Map();
  const missing = [];
  const overrides = loadLicenseOverrides(projectRoot);
  const usedOverrides = new Set();
  const packagesByIdentity = new Map(packages.map((pkg) => [packageIdentity(pkg), pkg]));

  for (const pkg of packages) {
    let files = candidateLicenseFiles(pkg);
    const identity = packageIdentity(pkg);
    const override = overrides.get(identity);
    if (files.length === 0 && override) {
      files = overrideLicenseFiles(pkg, packagesByIdentity, override, projectRoot);
      usedOverrides.add(identity);
    }
    if (files.length === 0) {
      missing.push(pkg);
      continue;
    }
    for (const path of files) {
      const text = readLicenseText(path);
      if (!text.trim()) continue;
      const hash = createHash("sha256").update(text, "utf8").digest("hex");
      const packageReference = {
        ecosystem: pkg.ecosystem,
        name: pkg.name,
        version: pkg.version,
        sourceUrl: pkg.sourceUrl,
        fileName: basename(path),
        reviewedOverride: override?.reviewedLicense,
      };
      const existing = documentsByHash.get(hash);
      if (existing) {
        existing.packages.push(packageReference);
      } else {
        documentsByHash.set(hash, { hash, text, packages: [packageReference] });
      }
    }
  }

  const documents = [...documentsByHash.values()]
    .map((document) => ({
      ...document,
      packages: document.packages.sort(
        (left, right) =>
          left.ecosystem.localeCompare(right.ecosystem) ||
          left.name.localeCompare(right.name) ||
          left.version.localeCompare(right.version) ||
          left.fileName.localeCompare(right.fileName),
      ),
    }))
    .sort((left, right) => {
      const leftPackage = left.packages[0];
      const rightPackage = right.packages[0];
      return (
        leftPackage.ecosystem.localeCompare(rightPackage.ecosystem) ||
        leftPackage.name.localeCompare(rightPackage.name) ||
        leftPackage.version.localeCompare(rightPackage.version) ||
        left.hash.localeCompare(right.hash)
      );
  });

  const staleOverrides = [...overrides.keys()].filter((identity) => !usedOverrides.has(identity));
  return { documents, missing, staleOverrides, reviewedOverrideCount: usedOverrides.size };
}

export function renderLicenseBundle(packages, projectRoot) {
  const { documents, missing, staleOverrides, reviewedOverrideCount } =
    collectLicenseDocuments(packages, projectRoot);
  const lines = [
    "PHITS AI Editor — Third-Party License Texts and Notices",
    "",
    "This file contains license, copyright, and notice texts supplied with the",
    "third-party packages included conservatively in the Windows binary review.",
    "Identical upstream texts are stored once and mapped to every applicable",
    "package. Line endings are normalized to LF; the text is otherwise unchanged.",
    "The PHITS AI Editor source code itself is licensed separately under",
    "Apache-2.0 in the repository-level LICENSE file.",
    "",
  ];

  for (const document of documents) {
    lines.push("=".repeat(80), "Packages:");
    for (const pkg of document.packages) {
      lines.push(
        `- ${pkg.ecosystem}:${pkg.name}@${pkg.version} — ${pkg.fileName}`,
        `  Source: ${pkg.sourceUrl}`,
      );
      if (pkg.reviewedOverride) {
        lines.push(`  Reviewed fallback: ${pkg.reviewedOverride}`);
      }
    }
    lines.push(`Text SHA-256: ${document.hash}`, "-".repeat(80), document.text, "");
  }

  return {
    text: `${lines.join("\n")}\n`,
    missing,
    staleOverrides,
    reviewedOverrideCount,
    documentCount: documents.length,
  };
}

export function packageIdentity(pkg) {
  return `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
}

export function isMplLicensed(pkg) {
  return /(?:^|[^A-Z])MPL(?:-2\.0)?(?:[^A-Z]|$)/i.test(pkg.license || "");
}

export function selectDistributedPackages(packages, productionNodeKeys) {
  return packages.filter(
    (pkg) => pkg.ecosystem === "cargo" || productionNodeKeys.has(packageKey(pkg.name, pkg.version)),
  );
}

export function nodePackageScope(pkg, productionNodeKeys) {
  return productionNodeKeys.has(packageKey(pkg.name, pkg.version))
    ? "Runtime"
    : "Build/test only";
}

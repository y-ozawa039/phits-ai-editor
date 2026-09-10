import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectNodePackages, packageSupportsTarget } from "./dependency-inventory.mjs";
import {
  auditLicensePolicy,
  collectLicenseDocuments,
  isMplLicensed,
  renderLicenseBundle,
  selectDistributedPackages,
} from "./license-compliance.mjs";

test("node inventory targets the official Windows x64 distribution deterministically", () => {
  assert.equal(packageSupportsTarget({ os: ["win32"], cpu: ["x64"] }), true);
  assert.equal(packageSupportsTarget({ os: ["linux"], cpu: ["x64"] }), false);
  assert.equal(packageSupportsTarget({ os: ["!win32"] }), false);
  assert.equal(packageSupportsTarget({ os: ["darwin", "win32"], cpu: ["x64"] }), true);
  assert.equal(packageSupportsTarget({ os: ["win32"], cpu: ["arm64"] }), false);
  assert.equal(packageSupportsTarget({}), true);
});

test("node inventory ignores stale pnpm store entries and other target platforms", () => {
  const root = mkdtempSync(join(tmpdir(), "phits-node-inventory-test-"));
  try {
    writeFileSync(
      join(root, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n\npackages:\n\n  locked@1:\n    resolution: {}\n\n  linux-only@1:\n    resolution: {}\n\nsnapshots:\n",
      "utf8",
    );
    const writePackage = (storeName, pkg) => {
      const packageDirectory = join(
        root,
        "node_modules",
        ".pnpm",
        storeName,
        "node_modules",
        pkg.name,
      );
      mkdirSync(packageDirectory, { recursive: true });
      writeFileSync(join(packageDirectory, "package.json"), JSON.stringify(pkg), "utf8");
    };
    writePackage("locked@1", { name: "locked", version: "1", license: "MIT", os: ["win32"] });
    writePackage("linux-only@1", {
      name: "linux-only",
      version: "1",
      license: "MIT",
      os: ["linux"],
    });
    writePackage("stale@1", { name: "stale", version: "1", license: "MIT", os: ["win32"] });

    assert.deepEqual(
      collectNodePackages(root).map((pkg) => pkg.name),
      ["locked"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("license policy rejects unknown and denied licenses but permits MPL-2.0", () => {
  const packages = [
    { ecosystem: "npm", name: "safe", version: "1", license: "MIT" },
    { ecosystem: "cargo", name: "mpl", version: "1", license: "MPL-2.0" },
    { ecosystem: "npm", name: "unknown", version: "1", license: "UNKNOWN — review required" },
    { ecosystem: "cargo", name: "copyleft", version: "1", license: "GPL-3.0" },
  ];

  const result = auditLicensePolicy(packages);
  assert.deepEqual(result.unknown.map((pkg) => pkg.name), ["unknown"]);
  assert.deepEqual(result.denied.map((pkg) => pkg.name), ["copyleft"]);
  assert.equal(isMplLicensed(packages[1]), true);
});

test("distributed package selection includes production npm and all Rust packages", () => {
  const packages = [
    { ecosystem: "npm", name: "runtime", version: "1" },
    { ecosystem: "npm", name: "build-only", version: "1" },
    { ecosystem: "cargo", name: "rust", version: "1" },
  ];

  const selected = selectDistributedPackages(packages, new Set(["runtime@1"]));
  assert.deepEqual(selected.map((pkg) => pkg.name), ["runtime", "rust"]);
});

test("license bundle deduplicates identical upstream texts and reports missing files", () => {
  const root = mkdtempSync(join(tmpdir(), "phits-license-test-"));
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    const missing = join(root, "missing");
    mkdirSync(first);
    mkdirSync(second);
    mkdirSync(missing);
    writeFileSync(join(first, "LICENSE"), "same license\n", "utf8");
    writeFileSync(join(second, "LICENSE.txt"), "same license\r\n", "utf8");

    const result = renderLicenseBundle([
      {
        ecosystem: "npm",
        name: "first",
        version: "1",
        license: "MIT",
        packageDirectory: first,
        sourceUrl: "https://example.test/first",
      },
      {
        ecosystem: "cargo",
        name: "second",
        version: "1",
        license: "MIT",
        packageDirectory: second,
        sourceUrl: "https://example.test/second",
      },
      {
        ecosystem: "cargo",
        name: "missing",
        version: "1",
        license: "MIT",
        packageDirectory: missing,
        sourceUrl: "https://example.test/missing",
      },
    ]);

    assert.equal(result.documentCount, 1);
    assert.equal(result.missing.length, 1);
    assert.match(result.text, /npm:first@1/);
    assert.match(result.text, /cargo:second@1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reviewed overrides are exact-version mappings and stale entries are reported", () => {
  const root = mkdtempSync(join(tmpdir(), "phits-license-override-test-"));
  try {
    const provider = join(root, "provider");
    const thirdParty = join(root, "third_party");
    mkdirSync(provider);
    mkdirSync(thirdParty);
    writeFileSync(join(provider, "LICENSE"), "reviewed license\n", "utf8");
    writeFileSync(
      join(thirdParty, "license-overrides.json"),
      JSON.stringify({
        version: 1,
        packages: {
          "cargo:missing@1": {
            reviewedLicense: "MIT",
            reason: "Published package omits the workspace-level license.",
            documents: [{ package: "cargo:provider@1", file: "LICENSE" }],
          },
          "cargo:old@1": {
            reviewedLicense: "MIT",
            reason: "Old reviewed mapping.",
            documents: [{ package: "cargo:provider@1", file: "LICENSE" }],
          },
        },
      }),
      "utf8",
    );

    const result = collectLicenseDocuments(
      [
        {
          ecosystem: "cargo",
          name: "provider",
          version: "1",
          license: "MIT",
          packageDirectory: provider,
          sourceUrl: "https://example.test/provider",
        },
        {
          ecosystem: "cargo",
          name: "missing",
          version: "1",
          license: "MIT",
          packageDirectory: join(root, "missing"),
          sourceUrl: "https://example.test/missing",
        },
      ],
      root,
    );

    assert.equal(result.missing.length, 0);
    assert.equal(result.reviewedOverrideCount, 1);
    assert.deepEqual(result.staleOverrides, ["cargo:old@1"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

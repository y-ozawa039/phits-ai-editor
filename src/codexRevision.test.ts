import { describe, expect, it } from "vitest";
import { hasDocumentRevisionConflict } from "./codexRevision";
import type { DocumentRevisionV1 } from "./types";

const baseline: DocumentRevisionV1 = {
  relativePath: "main.inp",
  diskSha256: "disk-a",
  bufferSha256: "buffer-a",
  modifiedAtMs: 100,
  dirty: false,
};

describe("Codex document revision guard", () => {
  it("accepts an unchanged disk and Monaco buffer", () => {
    expect(hasDocumentRevisionConflict(baseline, "disk-a", "buffer-a", 100)).toBe(false);
  });

  it.each([
    ["external disk edit", "disk-b", "buffer-a", 101],
    ["manual Monaco edit", "disk-a", "buffer-b", 100],
    ["mtime-only change", "disk-a", "buffer-a", 101],
  ])("detects %s", (_label, disk, buffer, modifiedAtMs) => {
    expect(hasDocumentRevisionConflict(baseline, disk, buffer, modifiedAtMs)).toBe(true);
  });
});

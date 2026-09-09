import type { DocumentRevisionV1 } from "./types";

export function hasDocumentRevisionConflict(
  baseline: DocumentRevisionV1,
  currentDiskSha256: string,
  currentBufferSha256: string,
  currentModifiedAtMs: number,
): boolean {
  return baseline.diskSha256 !== currentDiskSha256
    || baseline.bufferSha256 !== currentBufferSha256
    || baseline.modifiedAtMs !== currentModifiedAtMs;
}

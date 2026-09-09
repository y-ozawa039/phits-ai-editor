import { stripAnsi } from "./codexApproval";
import type { ApprovalFileChange } from "./types";

const MAX_REVIEW_CHARACTERS = 5_000_000;
const TRUNCATED_DIFF_MARKER = "[差分が大きいため、";

export type DiffReviewMode = "operationApproval" | "completedChange" | "history";
export type DiffReviewStatus = "awaitingApproval" | "resolving" | "pendingReview" | "reviewed" | "reverting" | "reverted" | "conflicted" | "failed";

export interface DiffReviewFile {
  path: string;
  kind: string;
  movedTo?: string;
  original: string;
  modified: string;
  diff: string;
  hunkCount: number;
  error?: string;
}

export interface DiffReviewState {
  mode: DiffReviewMode;
  requestKey?: string;
  itemId?: string;
  files: DiffReviewFile[];
  selectedFileIndex: number;
  status: DiffReviewStatus;
  groupId?: string;
  historyIds?: string[];
}

interface HunkHeader {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

function parseHunkHeader(line: string): HunkHeader | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!match) return null;
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
  };
}

export function changeKindValue(kind: unknown): string {
  if (typeof kind === "string") return kind;
  if (typeof kind === "object" && kind !== null && typeof (kind as Record<string, unknown>).type === "string") {
    return (kind as Record<string, unknown>).type as string;
  }
  return "update";
}

export function movePathValue(kind: unknown): string | undefined {
  if (typeof kind !== "object" || kind === null) return undefined;
  const movePath = (kind as Record<string, unknown>).move_path;
  return typeof movePath === "string" && movePath ? movePath : undefined;
}

export function countDiffHunks(diff: string): number {
  return stripAnsi(diff).split(/\r?\n/).filter((line) => parseHunkHeader(line) !== null).length;
}

/**
 * Reconstructs the complete proposed document from the App Server unified diff.
 * Every context/deletion line is checked against the current disk text so a
 * stale or malformed patch can never be presented as safely applicable.
 */
export function applyUnifiedDiff(original: string, diff: string): string {
  const lineEnding = original.includes("\r\n") ? "\r\n" : "\n";
  const normalizedOriginal = original.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const source = normalizedOriginal === "" ? [] : normalizedOriginal.split("\n");
  const patch = stripAnsi(diff).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const output: string[] = [];
  let sourceIndex = 0;
  let hunkCount = 0;

  for (let patchIndex = 0; patchIndex < patch.length;) {
    const header = parseHunkHeader(patch[patchIndex]);
    if (!header) {
      patchIndex += 1;
      continue;
    }
    hunkCount += 1;
    const targetIndex = header.oldStart === 0 ? 0 : header.oldStart - 1;
    if (targetIndex < sourceIndex || targetIndex > source.length) {
      throw new Error(`差分の適用位置が不正です: ${patch[patchIndex]}`);
    }
    output.push(...source.slice(sourceIndex, targetIndex));
    sourceIndex = targetIndex;
    patchIndex += 1;
    let consumedOld = 0;
    let producedNew = 0;

    while (patchIndex < patch.length && !parseHunkHeader(patch[patchIndex])) {
      const line = patch[patchIndex];
      if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) break;
      if (line === "\\ No newline at end of file") {
        patchIndex += 1;
        continue;
      }
      const prefix = line[0];
      const text = line.slice(1);
      if (prefix === " " || prefix === "-") {
        if (sourceIndex >= source.length || source[sourceIndex] !== text) {
          throw new Error(`差分の元テキストが現在のファイルと一致しません（${sourceIndex + 1}行目）。`);
        }
        sourceIndex += 1;
        consumedOld += 1;
        if (prefix === " ") {
          output.push(text);
          producedNew += 1;
        }
      } else if (prefix === "+") {
        output.push(text);
        producedNew += 1;
      } else if (line.length > 0) {
        break;
      }
      patchIndex += 1;
    }
    if (consumedOld !== header.oldCount || producedNew !== header.newCount) {
      throw new Error(`差分の行数がhunkヘッダーと一致しません: old=${consumedOld}/${header.oldCount}, new=${producedNew}/${header.newCount}`);
    }
  }

  if (hunkCount === 0) throw new Error("差分に変更箇所がありません。");
  output.push(...source.slice(sourceIndex));
  return output.join("\n").replace(/\n/g, lineEnding);
}

export function makeDiffReviewFile(change: ApprovalFileChange, original: string): DiffReviewFile {
  const kind = changeKindValue(change.kind);
  const unavailableReason = change.diff.includes(TRUNCATED_DIFF_MARKER)
    ? "差分表示が上限で省略されているため、完全な提案を復元できません。"
    : original.length > MAX_REVIEW_CHARACTERS
      ? `変更前ファイルが${MAX_REVIEW_CHARACTERS.toLocaleString()}文字を超えるため、差分レビューへ全量投入しません。`
      : undefined;
  if (unavailableReason) {
    return {
      path: change.path,
      kind,
      movedTo: movePathValue(change.kind),
      original: "",
      modified: "",
      diff: change.diff,
      hunkCount: countDiffHunks(change.diff),
      error: unavailableReason,
    };
  }
  try {
    return {
      path: change.path,
      kind,
      movedTo: movePathValue(change.kind),
      original,
      modified: applyUnifiedDiff(original, change.diff),
      diff: change.diff,
      hunkCount: countDiffHunks(change.diff),
    };
  } catch (error) {
    return {
      path: change.path,
      kind,
      movedTo: movePathValue(change.kind),
      original,
      modified: original,
      diff: change.diff,
      hunkCount: countDiffHunks(change.diff),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Accumulates separately completed App Server fileChange items from one turn.
 * The first pre-turn content remains the original and the newest disk content
 * becomes the modified side, so no earlier patch disappears from review.
 */
export function mergeAppliedDiffReviewFiles(existing: DiffReviewFile[], next: DiffReviewFile[]): DiffReviewFile[] {
  const merged = new Map(existing.map((file) => [file.path, file]));
  for (const file of next) {
    const previous = merged.get(file.path);
    if (!previous) {
      merged.set(file.path, file);
      continue;
    }
    merged.set(file.path, {
      ...file,
      original: previous.original,
      modified: file.modified,
      diff: [previous.diff, file.diff].filter(Boolean).join("\n"),
      hunkCount: previous.hunkCount + file.hunkCount,
      movedTo: file.movedTo ?? previous.movedTo,
      error: file.error ?? previous.error,
    });
  }
  return [...merged.values()];
}

import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, countDiffHunks, makeDiffReviewFile, mergeAppliedDiffReviewFiles } from "./diffReview";

describe("Codex main editor diff review", () => {
  it("reconstructs the complete file for an insertion at the first line", () => {
    const original = "$MPI=15\n[ Parameters ]\n";
    const diff = "@@ -1 +1,2 @@\n+TEST\n $MPI=15\n@@ -2 +3 @@\n [ Parameters ]";
    expect(applyUnifiedDiff(original, diff)).toBe("TEST\n$MPI=15\n[ Parameters ]\n");
    expect(countDiffHunks(diff)).toBe(2);
  });

  it("preserves CRLF while applying a multi-line replacement", () => {
    const original = "first\r\nold\r\nlast\r\n";
    const diff = "@@ -1,3 +1,3 @@\n first\n-old\n+new\n last";
    expect(applyUnifiedDiff(original, diff)).toBe("first\r\nnew\r\nlast\r\n");
  });

  it("handles a newly added file", () => {
    expect(applyUnifiedDiff("", "@@ -0,0 +1,2 @@\n+one\n+two")).toBe("one\ntwo");
  });

  it("handles deletion and records a validated move target", () => {
    expect(applyUnifiedDiff("one\ntwo\n", "@@ -1,3 +0,0 @@\n-one\n-two\n-")).toBe("");
    const review = makeDiffReviewFile({
      path: "old.inp",
      kind: { type: "update", move_path: "renamed.inp" },
      diff: "@@ -1 +1 @@\n-one\n+two",
    }, "one");
    expect(review.movedTo).toBe("renamed.inp");
    expect(review.modified).toBe("two");
  });

  it("refuses a stale diff instead of presenting a misleading proposal", () => {
    const review = makeDiffReviewFile({ path: "main.inp", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" }, "changed\n");
    expect(review.error).toContain("一致しません");
    expect(review.modified).toBe(review.original);
  });

  it("blocks a truncated diff because it cannot represent the whole proposal", () => {
    const review = makeDiffReviewFile({
      path: "main.inp",
      kind: { type: "update" },
      diff: "@@ -1 +1 @@\n-old\n+new\n[差分が大きいため、500,000文字で表示を省略しました]",
    }, "old");
    expect(review.error).toContain("完全な提案を復元できません");
    expect(review.original).toBe("");
  });

  it("accumulates multiple fileChange items from one turn without losing earlier edits", () => {
    const first = makeDiffReviewFile({
      path: "main.inp",
      kind: { type: "update" },
      diff: "@@ -1 +1 @@\n-TEST9\n+TEST10\n@@ -4 +4 @@\n-C-arm and Table test3\n+C-arm and Table test4",
    }, "TEST9\n\n[ Title ]\nC-arm and Table test3\n[ End ]\n");
    const second = makeDiffReviewFile({
      path: "main.inp",
      kind: { type: "update" },
      diff: "@@ -4,2 +4,3 @@\n C-arm and Table test4\n+\n [ End ]",
    }, first.modified);
    const [combined] = mergeAppliedDiffReviewFiles([first], [second]);
    expect(combined.original).toContain("TEST9");
    expect(combined.original).toContain("test3");
    expect(combined.modified).toContain("TEST10");
    expect(combined.modified).toContain("test4\n\n[ End ]");
    expect(combined.hunkCount).toBe(3);
  });

  it("keeps changes to different files in the same turn", () => {
    const first = makeDiffReviewFile({ path: "main.inp", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" }, "old");
    const second = makeDiffReviewFile({ path: "notes.txt", kind: { type: "add" }, diff: "@@ -0,0 +1 @@\n+note" }, "");
    expect(mergeAppliedDiffReviewFiles([first], [second]).map((file) => file.path)).toEqual(["main.inp", "notes.txt"]);
  });
});

import { describe, expect, it } from "vitest";
import { approvalRequestKey, changeKindLabel, normalizeApprovalRequest, normalizeAvailableDecisions, sameRequestId, stripAnsi, truncateDiff, unifiedDiffSides } from "./codexApproval";

describe("Codex approval normalization", () => {
  it("normalizes a file change request and ignores unknown methods", () => {
    expect(normalizeApprovalRequest({ requestId: 1, method: "unknown" })).toBeNull();
    expect(normalizeApprovalRequest({ requestId: 1, method: "unknown", kind: "fileChange" })).toBeNull();
    expect(normalizeApprovalRequest({ requestId: 1, method: "item/fileChange/requestApproval", kind: "commandExecution" })).toBeNull();
    expect(normalizeApprovalRequest({
      requestId: "abc",
      method: "item/fileChange/requestApproval",
      threadId: "thread-1",
      changes: [{ path: "main.inp", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" }],
    })).toMatchObject({
      requestId: "abc",
      kind: "fileChange",
      threadId: "thread-1",
      changes: [{ path: "main.inp" }],
    });
  });

  it("keeps numeric and string request IDs distinct", () => {
    expect(approvalRequestKey({ requestId: 7, method: "m" })).not.toBe(approvalRequestKey({ requestId: "7", method: "m" }));
    expect(sameRequestId(7, "7")).toBe(false);
    expect(sameRequestId("7", "7")).toBe(true);
  });

  it("reconstructs both sides of a unified diff", () => {
    expect(unifiedDiffSides("diff --git a/x b/x\n@@ -1,3 +1,3 @@\n same\n-old\n+new\n tail")).toEqual({
      original: "same\nold\ntail",
      modified: "same\nnew\ntail",
    });
  });

  it("strips terminal control sequences and labels change kinds", () => {
    expect(stripAnsi("\u001b[31merror\u001b[0m\r\nnext")).toBe("error\nnext");
    expect(changeKindLabel({ type: "add" })).toBe("新規作成");
    expect(changeKindLabel("delete")).toBe("削除");
  });

  it("bounds extremely large diffs", () => {
    const result = truncateDiff("x".repeat(500_001));
    expect(result.length).toBeLessThan(500_200);
    expect(result).toContain("表示を省略しました");
  });

  it("normalizes only supported approval decisions", () => {
    expect(normalizeAvailableDecisions(["accept", "acceptForSession", "unknown"], "fileChange")).toEqual(["accept", "acceptForSession"]);
    expect(normalizeAvailableDecisions([{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["pnpm", "test"] } }], "commandExecution")).toEqual(["acceptWithExecPolicyAmendment"]);
    expect(normalizeAvailableDecisions(undefined, "fileChange")).toContain("cancel");
  });
});

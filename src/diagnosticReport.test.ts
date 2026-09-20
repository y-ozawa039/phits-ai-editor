import { describe, expect, it } from "vitest";
import { buildDiagnosticReport } from "./diagnosticReport";

describe("buildDiagnosticReport", () => {
  it("marks reports as snapshots that are not reused", () => {
    const report = buildDiagnosticReport({
      appVersion: "0.0.7-alpha",
      workspaceRoot: "C:\\research",
      runtime: null,
      compatibility: null,
      agentSetup: null,
      sandbox: null,
      workspaceEnvironment: null,
    });
    expect(report).toContain("ワークスペース: C:\\research");
    expect(report).toContain("次回の利用可否判定には再利用されません");
  });

  it("records the optional live-edit route and a session-only user override", () => {
    const report = buildDiagnosticReport({
      appVersion: "0.0.8-alpha",
      workspaceRoot: "C:\\research",
      runtime: null,
      compatibility: null,
      agentSetup: null,
      sandbox: null,
      workspaceEnvironment: null,
      editingAccess: "userOverride",
      liveEditProbe: {
        state: "unavailable",
        workspaceRoot: "C:\\research",
        checkedAt: "2026-09-20T00:00:00Z",
        model: "model-a",
        reasoningEffort: "low",
        route: "fileChange",
        detail: "検査用ファイルの内容が一致しませんでした。",
        cleanupSucceeded: true,
        threadCleanupSucceeded: true,
      },
    });
    expect(report).toContain("[任意のCodex実編集検査]");
    expect(report).toContain("経路: fileChange");
    expect(report).toContain("利用者の選択で解除（現在のワークスペースと接続中のみ）");
  });
});

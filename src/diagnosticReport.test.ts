import { describe, expect, it } from "vitest";
import { buildDiagnosticReport } from "./diagnosticReport";

describe("buildDiagnosticReport", () => {
  it("marks reports as snapshots that are not reused", () => {
    const report = buildDiagnosticReport({
      appVersion: "0.0.6-alpha",
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
});

import { describe, expect, it } from "vitest";
import { sandboxEditingAvailable } from "./codexSandbox";
import type { CodexSandboxProbeReport } from "./types";

function report(overrides: Partial<CodexSandboxProbeReport> = {}): CodexSandboxProbeReport {
  return {
    state: "unavailable",
    workspaceRoot: "C:\\work",
    checkedAt: "2026-09-20T00:00:00Z",
    readiness: "ready",
    implementation: "unelevated",
    allowedImplementations: [],
    checks: [],
    messages: [],
    supportPrompt: "",
    ...overrides,
  };
}

describe("sandboxEditingAvailable", () => {
  it("uses the backend decision when it is present", () => {
    expect(sandboxEditingAvailable(report({ editingAvailable: false, state: "available" }))).toBe(false);
  });

  it("requires command execution and every workspace write check", () => {
    const checks: CodexSandboxProbeReport["checks"] = [
      { id: "commandExecution", state: "available", detail: "ok" },
      { id: "workspaceCreate", state: "available", detail: "ok" },
      { id: "existingFileWrite", state: "available", detail: "ok" },
      { id: "childDirectoryWrite", state: "available", detail: "ok" },
    ];
    expect(sandboxEditingAvailable(report({ checks }))).toBe(true);
    expect(sandboxEditingAvailable(report({ checks: checks.slice(0, 3) }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { classifyCodexConnectionFailure } from "./codexConnectionFailure";
import type { CodexCompatibilityReport } from "./types";

const compatible: CodexCompatibilityReport = {
  state: "compatible",
  codexPath: "C:\\Tools\\codex.exe",
  codexVersion: "codex-cli 0.155.0",
  baselineVersion: "0.153.1",
  checkedAt: "2026-09-19T00:00:00Z",
  features: [],
  messages: [],
};

describe("classifyCodexConnectionFailure", () => {
  it("distinguishes authentication failures", () => {
    expect(classifyCodexConnectionFailure("401 Unauthorized", compatible).category).toBe("authentication");
  });

  it("distinguishes network policy failures", () => {
    expect(classifyCodexConnectionFailure("TLS certificate rejected by proxy", compatible).category).toBe("network");
  });

  it("reports a missing CLI before classifying its raw error", () => {
    expect(classifyCodexConnectionFailure("unknown", null).category).toBe("cliMissing");
  });
});

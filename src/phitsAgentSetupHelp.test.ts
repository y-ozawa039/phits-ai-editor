import { describe, expect, it } from "vitest";
import { buildPhitsAgentSetupHelp } from "./phitsAgentSetupHelp";

describe("buildPhitsAgentSetupHelp", () => {
  it("includes the static check evidence and safe repair constraints", () => {
    const prompt = buildPhitsAgentSetupHelp({
      workspaceRoot: "D:\\research\\case-a",
      connectionError: "App Serverを開始できませんでした。",
      diagnostics: {
        phitsRoot: "D:\\phits337",
        phitsPathSource: "environment",
        phitsVersion: "3.370",
        compatibility: "supported",
        phitsReady: true,
        phitsWrapper: "D:\\phits337\\workbench\\task\\win\\run_phits_no_pause.ps1",
        languageSpec: null,
        codexPath: "C:\\tools\\codex.exe",
        codexVersion: "0.153.4",
        codexCompatible: true,
        messages: [],
      },
      compatibility: null,
      setup: {
        configured: false,
        state: "mismatch",
        sourcePath: null,
        message: "別のPHITSルートを参照しています。",
        checks: [{
          id: "codexGlobal",
          state: "mismatch",
          path: "C:\\Users\\user\\.codex\\AGENTS.md",
          message: "現在のPHITSルートと一致しません。",
        }],
      },
    });

    expect(prompt).toContain("ChatGPTデスクトップ版のローカルCodexタスク");
    expect(prompt).toContain("D:\\phits337");
    expect(prompt).toContain("C:\\Users\\user\\.codex\\AGENTS.md");
    expect(prompt).toContain("AGENTS.override.md");
    expect(prompt).toContain("変更差分");
    expect(prompt).toContain("Cloudタスクではなく");
  });

  it("does not claim that App Server loaded the instructions", () => {
    const prompt = buildPhitsAgentSetupHelp({
      workspaceRoot: "C:\\work",
      setup: null,
      diagnostics: null,
      compatibility: null,
      connectionError: null,
    });
    expect(prompt).toContain("静的検査");
    expect(prompt).toContain("証明ではありません");
  });
});

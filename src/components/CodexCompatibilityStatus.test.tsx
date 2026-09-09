import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodexCompatibilityStatus } from "./CodexCompatibilityStatus";
import type { CodexCompatibilityReport } from "../types";

const report: CodexCompatibilityReport = {
  state: "limited",
  codexPath: "codex.exe",
  codexVersion: "codex-cli 0.154.0",
  baselineVersion: "0.153.1",
  checkedAt: "2026-09-08T00:00:00Z",
  features: [
    { id: "chat", state: "available", detail: "ok" },
    { id: "threads", state: "available", detail: "ok" },
    { id: "fileEditing", state: "unavailable", detail: "missing schema" },
    { id: "approvals", state: "limited", detail: "limited" },
  ],
  messages: ["一部のCodex機能を安全のため無効化します。"],
};

describe("CodexCompatibilityStatus", () => {
  it("shows each feature independently", () => {
    render(<CodexCompatibilityStatus report={report} busy={false} />);
    expect(screen.getByText("一部機能のみ利用可能")).toBeTruthy();
    expect(screen.getByText("ファイル編集")).toBeTruthy();
    expect(screen.getByText("利用不可")).toBeTruthy();
    expect(screen.getByText("制限あり")).toBeTruthy();
  });

  it("shows the startup probing state", () => {
    render(<CodexCompatibilityStatus report={null} busy />);
    expect(screen.getByText("Codex機能を確認中…")).toBeTruthy();
  });
});

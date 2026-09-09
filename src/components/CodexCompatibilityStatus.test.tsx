import { fireEvent, render, screen } from "@testing-library/react";
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
  it("keeps feature details collapsed until the summary is expanded", () => {
    render(<CodexCompatibilityStatus report={report} busy={false} />);
    const summary = screen.getByRole("button", { name: "一部機能のみ利用可能" });
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("ファイル編集")).toBeNull();

    fireEvent.click(summary);

    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("ファイル編集")).toBeTruthy();
    expect(screen.getByText("利用不可")).toBeTruthy();
    expect(screen.getByText("制限あり")).toBeTruthy();

    fireEvent.click(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("ファイル編集")).toBeNull();
  });

  it("shows the startup probing state", () => {
    render(<CodexCompatibilityStatus report={null} busy />);
    expect(screen.getByText("Codex機能を確認中…")).toBeTruthy();
  });
});

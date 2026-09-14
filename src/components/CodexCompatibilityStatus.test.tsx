import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodexCompatibilityStatus } from "./CodexCompatibilityStatus";
import type { CodexCompatibilityReport, CodexSandboxProbeReport, PhitsAgentSetupStatus } from "../types";

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

  it("replaces the previous result with one stable label while rechecking", () => {
    render(<CodexCompatibilityStatus report={report} busy sandboxBusy />);
    expect(screen.getByRole("button", { name: "Codex編集環境：確認中…" })).toBeTruthy();
    expect(screen.queryByText("Codex編集環境：編集不可")).toBeNull();
    expect(screen.queryByText("編集環境を確認中…")).toBeNull();
  });

  it("adds live editing checks to the existing expandable diagnosis", () => {
    const compatibleReport: CodexCompatibilityReport = {
      ...report,
      state: "compatible",
      features: report.features.map((feature) => ({ ...feature, state: "available" })),
    };
    const sandbox: CodexSandboxProbeReport = {
      state: "available",
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-13T00:00:00Z",
      readiness: "ready",
      implementation: "unelevated",
      allowedImplementations: ["unelevated"],
      checks: [
        { id: "appServer", state: "available", detail: "ok" },
        { id: "windowsSandbox", state: "available", detail: "ok" },
        { id: "commandExecution", state: "available", detail: "ok" },
        { id: "workspaceWrite", state: "available", detail: "ok" },
      ],
      messages: [],
      supportPrompt: "",
    };
    const setup = { configured: true } as PhitsAgentSetupStatus;

    const { container } = render(
      <CodexCompatibilityStatus
        report={compatibleReport}
        busy={false}
        sandbox={sandbox}
        setup={setup}
      />,
    );
    const summary = screen.getByRole("button", { name: "Codex編集環境：確認済み" });

    fireEvent.click(summary);

    const windowsSandbox = container.querySelector(".codex-feature-row-wide");
    expect(windowsSandbox).toHaveClass("codex-feature-row-wide");
    expect(windowsSandbox).toHaveTextContent("Sandbox利用可能");
    expect(container.querySelectorAll(".codex-feature-spacer")).toHaveLength(1);
    expect(screen.getByText("Sandbox方式")).toBeTruthy();
    expect(screen.getAllByText("unelevated")).toHaveLength(2);
    expect(screen.getByText("コマンド実行")).toBeTruthy();
    expect(screen.getAllByText("ファイル編集")).toHaveLength(2);
  });
});

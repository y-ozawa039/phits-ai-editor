import { fireEvent, render, screen, within } from "@testing-library/react";
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
        { id: "workspaceCreate", state: "available", detail: "ok" },
        { id: "existingFileWrite", state: "available", detail: "ok" },
        { id: "childDirectoryWrite", state: "available", detail: "ok" },
        { id: "workspacePermissions", state: "limited", detail: "継承停止" },
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

    expect(container.querySelector(".codex-feature-list")).toBeTruthy();
    expect(screen.getByText("Sandbox")).toBeTruthy();
    expect(screen.getByText("Sandbox方式")).toBeTruthy();
    expect(screen.getByText("unelevated")).toBeTruthy();
    expect(screen.getByText("コマンド実行")).toBeTruthy();
    expect(screen.getByText("ワークスペース編集")).toBeTruthy();
    expect(screen.getByText("アクセス規則")).toBeTruthy();
    expect(screen.queryByText("直下への作成")).toBeNull();
    expect(screen.queryByText("既存ファイルの変更")).toBeNull();
    expect(screen.queryByText("子階層への作成")).toBeNull();
    expect(screen.queryByText("許可方式")).toBeNull();
  });

  it("summarizes workspace write checks using the most restrictive result", () => {
    const compatibleReport: CodexCompatibilityReport = {
      ...report,
      state: "compatible",
      features: report.features.map((feature) => ({ ...feature, state: "available" })),
    };
    const sandbox: CodexSandboxProbeReport = {
      state: "unavailable",
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-13T00:00:00Z",
      readiness: "ready",
      implementation: "elevated",
      allowedImplementations: ["elevated"],
      checks: [
        { id: "workspaceCreate", state: "available", detail: "直下は利用可能" },
        { id: "existingFileWrite", state: "limited", detail: "既存ファイルは要確認" },
        { id: "childDirectoryWrite", state: "unavailable", detail: "子階層は利用不可" },
      ],
      messages: [],
      supportPrompt: "",
    };

    const { container } = render(<CodexCompatibilityStatus report={compatibleReport} busy={false} sandbox={sandbox} />);
    fireEvent.click(within(container).getByRole("button", { name: "Codex編集環境：書込み未確認" }));

    const workspaceEditing = within(container).getByText("ワークスペース編集").closest(".codex-feature-row");
    expect(workspaceEditing).toHaveTextContent("利用不可");
    expect(workspaceEditing).toHaveAttribute("title", expect.stringContaining("子階層への作成: 子階層は利用不可"));
  });
});

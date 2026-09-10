import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CodexPanel } from "./CodexPanel";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const baseProps = {
  open: true,
  width: 360,
  connected: true,
  busy: false,
  models: [{ id: "model-a", displayName: "Model A", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: ["low", "medium"] }],
  model: "model-a",
  reasoning: "medium",
  approvalMode: "confirmFirst" as const,
  threadId: "thread-1",
  messages: [],
  approval: null,
  onToggle: vi.fn(),
  onResizeStart: vi.fn(),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onModelChange: vi.fn(),
  onReasoningChange: vi.fn(),
  onApprovalModeChange: vi.fn(),
  onNewThread: vi.fn(),
  onResumeThread: vi.fn(),
  onRenameThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onRemoveContext: vi.fn(),
  onSend: vi.fn(),
  onInterrupt: vi.fn(),
  onApproval: vi.fn(),
};

afterEach(cleanup);

describe("CodexPanel", () => {
  it("uses the product spelling Codex without all-caps transformation", () => {
    const { container } = render(<CodexPanel {...baseProps} />);
    expect(screen.getByText("Codex", { selector: ".codex-brand" })).toBeInTheDocument();
    expect(container.querySelector(".codex-brand")).toHaveClass("panel-title", "codex-brand");
  });

  it("sends a trimmed message on Enter", () => {
    const onSend = vi.fn();
    render(<CodexPanel {...baseProps} onSend={onSend} />);
    const input = screen.getByPlaceholderText("Codexにメッセージを送信…");
    fireEvent.change(input, { target: { value: "  入力を確認して  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("入力を確認して");
  });

  it("shows approval details and resolves the decision", () => {
    const onApproval = vi.fn();
    render(<CodexPanel {...baseProps} approval={{
      requestId: 7,
      method: "item/fileChange/requestApproval",
      kind: "fileChange",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      reason: "半径を変更します",
      availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
      changes: [{ path: "sample.inp", kind: { type: "update" }, diff: "@@ -1,2 +1,2 @@\n [ Surface ]\n-1 so 10\n+1 so 5" }],
    }} onApproval={onApproval} />);
    expect(screen.getByText("ファイル変更の承認")).toBeInTheDocument();
    expect(screen.getByText("sample.inp")).toBeInTheDocument();
    expect(screen.getByText("1ファイルの変更案")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "許可" }));
    expect(onApproval).toHaveBeenCalledWith("accept");
  });

  it("opens the main Editor diff review from a file approval", () => {
    const onOpenDiff = vi.fn();
    const { container } = render(<CodexPanel {...baseProps} approval={{
      requestId: 8,
      method: "item/fileChange/requestApproval",
      kind: "fileChange",
      availableDecisions: ["accept", "decline"],
      changes: [{ path: "main.inp", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" }],
    }} onOpenDiff={onOpenDiff} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>(".approval-diff-summary button")!);
    expect(onOpenDiff).toHaveBeenCalledOnce();
  });

  it("resets the panel width when the resize divider is double-clicked", () => {
    const onResizeReset = vi.fn();
    const { container } = render(<CodexPanel {...baseProps} onResizeReset={onResizeReset} />);
    fireEvent.doubleClick(container.querySelector(".vertical-resizer")!);
    expect(onResizeReset).toHaveBeenCalledOnce();
  });

  it("shows command, cwd and queued count without raw JSON", () => {
    render(<CodexPanel {...baseProps} approvalCount={2} approval={{
      requestId: "request-2",
      method: "item/commandExecution/requestApproval",
      kind: "commandExecution",
      cwd: "C:\\work",
      command: "\u001b[31mpnpm test\u001b[0m",
      commandActions: [{ type: "read", path: "sample.inp" }],
      changes: [],
    }} />);
    expect(screen.getByText("コマンド実行の承認")).toBeInTheDocument();
    expect(screen.getByText("残り 2 件")).toBeInTheDocument();
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    expect(screen.getByText("C:\\work")).toBeInTheDocument();
    expect(screen.getByText("読み取り: sample.inp")).toBeInTheDocument();
    expect(screen.queryByText(/requestId/)).not.toBeInTheDocument();
  });

  it("renders Codex messages as Markdown and opens safe external links", () => {
    render(<CodexPanel {...baseProps} messages={[{
      id: "assistant-1",
      role: "assistant",
      text: "## 確認\n**半径**は `5 cm` です。\n\n- 入力を保存\n- [公式資料](https://example.com/guide)",
    }]} />);

    expect(screen.getByRole("heading", { name: "確認" })).toBeInTheDocument();
    expect(screen.getByText("半径").tagName).toBe("STRONG");
    expect(screen.getByText("5 cm").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "公式資料" });
    fireEvent.click(link);
    expect(openUrl).toHaveBeenCalledWith("https://example.com/guide");
  });

  it("does not create a clickable link for an unsafe scheme", () => {
    render(<CodexPanel {...baseProps} messages={[{
      id: "assistant-2",
      role: "assistant",
      text: "[実行しない](javascript:alert(1))",
    }]} />);

    expect(screen.queryByRole("link", { name: "実行しない" })).not.toBeInTheDocument();
    expect(screen.getByText("実行しない")).toHaveClass("message-link-disabled");
  });

  it("uses titled thread entries without exposing a raw thread id input", () => {
    render(<CodexPanel {...baseProps} threads={[{ threadId: "thread-1", title: "水ファントムの確認", lastUsedAt: "2026-09-06T00:00:00+09:00" }]} />);
    expect(screen.getAllByText("水ファントムの確認").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByPlaceholderText("スレッドID")).not.toBeInTheDocument();
  });

  it("offers rename and permanent delete from the thread context menu", () => {
    const onDeleteThread = vi.fn();
    render(<CodexPanel {...baseProps} threads={[{ threadId: "thread-1", title: "旧タイトル", lastUsedAt: "2026-09-06T00:00:00+09:00" }]} onDeleteThread={onDeleteThread} />);
    fireEvent.contextMenu(screen.getAllByText("旧タイトル")[0]);
    expect(screen.getByRole("menuitem", { name: "名前を変更" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "完全に削除" }));
    expect(onDeleteThread).toHaveBeenCalledWith("thread-1", "旧タイトル");
  });

  it("changes approval mode and allows removing context chips", () => {
    const onApprovalModeChange = vi.fn();
    const onRemoveContext = vi.fn();
    const { container } = render(<CodexPanel {...baseProps} contextChips={[{ id: "selection", label: "選択: 2–4行" }]} onApprovalModeChange={onApprovalModeChange} onRemoveContext={onRemoveContext} />);
    fireEvent.change(container.querySelector(".approval-mode-label select")!, { target: { value: "consultationOnly" } });
    expect(onApprovalModeChange).toHaveBeenCalledWith("consultationOnly");
    fireEvent.click(screen.getByRole("button", { name: "選択: 2–4行をコンテキストから外す" }));
    expect(onRemoveContext).toHaveBeenCalledWith("selection");
  });

  it("disables connection when the chat protocol is unavailable", () => {
    render(<CodexPanel {...baseProps} connected={false} threadId={null} chatAvailable={false} />);
    expect(screen.getByRole("button", { name: "Codexに接続" })).toBeDisabled();
    expect(screen.getByText(/会話機能に互換性がありません/)).toBeInTheDocument();
  });

  it("falls back to consultation-only when editing or approvals are unavailable", () => {
    const { container } = render(<CodexPanel {...baseProps} writableAvailable={false} />);
    const select = container.querySelector<HTMLSelectElement>(".approval-mode-label select")!;
    expect(select).toBeDisabled();
    expect(select.value).toBe("consultationOnly");
    expect(screen.getByText(/相談のみに制限します/)).toBeInTheDocument();
  });

  it("shows the official PHITS setup guidance when the Codex pointer is missing", () => {
    render(<CodexPanel {...baseProps} phitsAgentSetup={{
      configured: false,
      sourcePath: null,
      message: "PHITS公式の workbench/README-jp.docx を確認してください。",
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("PHITS用Codex設定を確認してください");
    expect(screen.getByRole("alert")).toHaveTextContent("workbench/README-jp.docx");
  });

  it("does not show setup guidance after the PHITS Codex pointer is verified", () => {
    render(<CodexPanel {...baseProps} phitsAgentSetup={{
      configured: true,
      sourcePath: "C:\\Users\\user\\.codex\\AGENTS.md",
      message: "PHITS用Codex設定を確認しました。",
    }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("follows streaming messages while the transcript is at the latest position", () => {
    const first = [{ id: "assistant-stream", role: "assistant" as const, text: "確認中", streaming: true }];
    const { container, rerender } = render(<CodexPanel {...baseProps} messages={first} busy />);
    const transcript = container.querySelector(".chat-transcript") as HTMLDivElement;
    Object.defineProperty(transcript, "scrollHeight", { configurable: true, value: 640 });
    Object.defineProperty(transcript, "clientHeight", { configurable: true, value: 240 });

    rerender(<CodexPanel {...baseProps} messages={[{ ...first[0], text: "確認中です。変更案を作成しています。" }]} busy />);

    expect(transcript.scrollTop).toBe(640);
  });

  it("does not pull the transcript down after the user scrolls away from the latest message", () => {
    const first = [{ id: "assistant-stream", role: "assistant" as const, text: "確認中", streaming: true }];
    const { container, rerender } = render(<CodexPanel {...baseProps} messages={first} busy />);
    const transcript = container.querySelector(".chat-transcript") as HTMLDivElement;
    Object.defineProperty(transcript, "scrollHeight", { configurable: true, value: 640 });
    Object.defineProperty(transcript, "clientHeight", { configurable: true, value: 240 });
    transcript.scrollTop = 120;
    fireEvent.scroll(transcript);

    rerender(<CodexPanel {...baseProps} messages={[{ ...first[0], text: "確認中です。変更案を作成しています。" }]} busy />);

    expect(transcript.scrollTop).toBe(120);
  });
});

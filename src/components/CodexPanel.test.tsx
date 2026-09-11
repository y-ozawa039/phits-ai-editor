import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("explains how to enable chat when no thread is selected", () => {
    render(<CodexPanel {...baseProps} threadId={null} threads={[]} />);
    const input = screen.getByPlaceholderText("[新しいスレッド]をクリックするか、既存スレッドを選択してください");
    expect(input).toBeDisabled();
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
      state: "missing",
      sourcePath: null,
      message: "PHITS公式の workbench/README-jp.docx を確認してください。",
      checks: [{ id: "codexGlobal", state: "missing", path: "C:\\Users\\user\\.codex\\AGENTS.md", message: "有効な指示ファイルがありません。" }],
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("PHITS用Codex設定を確認してください");
    expect(screen.getByRole("alert")).toHaveTextContent("workbench/README-jp.docx");
    fireEvent.click(screen.getByText("検査したファイルと理由"));
    expect(screen.getByRole("alert")).toHaveTextContent("C:\\Users\\user\\.codex\\AGENTS.md");
  });

  it("presents a partial setup result as non-blocking information", () => {
    render(<CodexPanel {...baseProps} phitsAgentSetup={{
      configured: false,
      state: "partial",
      sourcePath: null,
      message: "PHITS側のAI設定は確認しました。接続と会話は引き続き利用できます。",
      checks: [{ id: "phitsRoot", state: "confirmed", path: "D:\\phits337\\AGENTS.md", message: "現在のPHITSルートに対応する参照を確認しました。" }],
    }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("PHITS用Codex設定を一部確認しました");
    expect(screen.getByRole("status")).toHaveTextContent("接続と会話は引き続き利用できます");
  });

  it("shows an editable desktop-Codex handoff before an Editor connection succeeds", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CodexPanel {...baseProps} connected={false} threadId={null} troubleshootingPrompt="診断結果と安全な復旧手順" phitsAgentSetup={{
      configured: false,
      state: "partial",
      sourcePath: null,
      message: "PHITS側だけ確認しました。",
      checks: [],
    }} />);

    expect(screen.getByText(/ChatGPTデスクトップ版でCodexを開き/)).toBeInTheDocument();
    const prompt = screen.getByRole("textbox", { name: "生成AIへの相談文" });
    fireEvent.change(prompt, { target: { value: "編集した相談文" } });
    fireEvent.click(screen.getByRole("button", { name: "相談文をコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("編集した相談文"));
    expect(screen.queryByRole("button", { name: "Codex入力欄へ挿入" })).not.toBeInTheDocument();
  });

  it("offers the desktop-Codex handoff when chat compatibility prevents connection", () => {
    render(<CodexPanel {...baseProps} connected={false} threadId={null} chatAvailable={false} connectionError="Codex CLIを利用できません。" troubleshootingPrompt="接続診断文" phitsAgentSetup={{
      configured: true,
      state: "confirmed",
      sourcePath: "C:\\phits\\AGENTS.md",
      message: "確認しました。",
      checks: [],
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Codexに接続できませんでした");
    expect(screen.getByRole("textbox", { name: "生成AIへの相談文" })).toHaveValue("接続診断文");
    expect(screen.getByText(/ChatGPTデスクトップ版/)).toBeInTheDocument();
  });

  it("inserts the reviewed troubleshooting text into the connected composer without sending it", () => {
    const onSend = vi.fn();
    render(<CodexPanel {...baseProps} troubleshootingPrompt="初期相談文" onSend={onSend} phitsAgentSetup={{
      configured: false,
      state: "partial",
      sourcePath: null,
      message: "PHITS側だけ確認しました。",
      checks: [],
    }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "生成AIへの相談文" }), { target: { value: "確認済み相談文" } });
    fireEvent.click(screen.getByRole("button", { name: "Codex入力欄へ挿入" }));
    expect(screen.getByPlaceholderText("Codexにメッセージを送信…")).toHaveValue("確認済み相談文");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not show setup guidance after the PHITS Codex pointer is verified", () => {
    render(<CodexPanel {...baseProps} phitsAgentSetup={{
      configured: true,
      state: "confirmed",
      sourcePath: "C:\\Users\\user\\.codex\\AGENTS.md",
      message: "PHITS用Codex設定を確認しました。",
      checks: [],
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

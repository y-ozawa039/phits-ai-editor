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

afterEach(() => {
  cleanup();
  vi.mocked(openUrl).mockClear();
});

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

  it("offers the shared diagnostic report dialog only from a problem notice", () => {
    const onSaveDiagnosticReport = vi.fn();
    render(<CodexPanel
      {...baseProps}
      phitsAgentSetup={{ configured: false, state: "missing", sourcePath: null, message: "設定がありません。", checks: [] }}
      onSaveDiagnosticReport={onSaveDiagnosticReport}
    />);

    fireEvent.click(screen.getByRole("button", { name: "診断レポートを保存…" }));
    expect(onSaveDiagnosticReport).toHaveBeenCalledTimes(1);
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
      availableDecisions: ["accept", "decline"],
      changes: [],
    }} />);
    expect(screen.getByText("コマンド実行の承認")).toBeInTheDocument();
    expect(screen.getByText("残り 2 件")).toBeInTheDocument();
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    expect(screen.getByText("C:\\work")).toBeInTheDocument();
    expect(screen.getByText("読み取り: sample.inp")).toBeInTheDocument();
    expect(screen.queryByText(/requestId/)).not.toBeInTheDocument();
    const scrollBody = document.querySelector<HTMLElement>(".approval-scroll-body")!;
    expect(scrollBody).toContainElement(screen.getByText("pnpm test"));
    expect(scrollBody).not.toContainElement(screen.getByRole("button", { name: "拒否" }));
    expect(scrollBody).not.toContainElement(screen.getByRole("button", { name: "許可" }));
  });

  it("keeps proposed command tokens out of the additional permissions list", () => {
    render(<CodexPanel {...baseProps} approval={{requestId: 1, method: "item/commandExecution/requestApproval", kind: "commandExecution",
      command: "Get-Content -LiteralPath main.inp -Raw", proposedExecpolicyAmendment: ["Get-Content", "-LiteralPath", "main.inp", "-Raw"], changes: [], availableDecisions: ["accept", "acceptWithExecPolicyAmendment"]}} />);
    expect(screen.queryByText("要求される追加権限")).not.toBeInTheDocument();
    expect(screen.getByText("今後の承認を省略するコマンド規則（候補）")).toBeInTheDocument();
    expect(screen.getByText(/指定したファイルの内容を読み取る/)).toBeInTheDocument();
  });

  it("requires an explicit tool answer and sends the original option label", () => {
    const onApproval = vi.fn();
    render(<CodexPanel {...baseProps} approval={{requestId: "tool-1", method: "item/tool/requestUserInput", kind: "toolUserInput", changes: [],
      questions: [{id:"approval", header:"PHITS tool", question:"Run?", options:[{label:"Accept", description:"Run once"},{label:"Decline",description:"Do not run"}]}]}} onApproval={onApproval} />);
    expect(screen.getByRole("button", {name:"回答を送信"})).toBeDisabled();
    expect(onApproval).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("PHITS tool"), {target:{value:"Accept"}});
    fireEvent.click(screen.getByRole("button", {name:"回答を送信"}));
    expect(onApproval).toHaveBeenCalledWith("accept", {approval:"Accept"});
    const body = document.querySelector(".approval-scroll-body")!;
    expect(body).not.toContainElement(screen.getByRole("button", {name:"回答を送信"}));
  });

  it("shows MCP approval arguments and keeps all decisions outside the scrolling body", () => {
    const onApproval=vi.fn();
    render(<CodexPanel {...baseProps} approval={{requestId:0,method:"mcpServer/elicitation/request",kind:"mcpToolApproval",serverName:"phits_ai_editor",
      reason:'Allow the phits_ai_editor MCP server to run tool "run_phits"?',toolArguments:{inputRelativePath:"main.inp"},changes:[],availableDecisions:["accept","decline","cancel"]}} onApproval={onApproval} />);
    expect(screen.getByText("MCPツール利用の承認")).toBeInTheDocument();
    expect(screen.getByText(/"inputRelativePath": "main.inp"/)).toBeInTheDocument();
    for (const label of ["許可","拒否","中止"]) expect(document.querySelector(".approval-scroll-body")).not.toContainElement(screen.getByRole("button",{name:label}));
    fireEvent.click(screen.getByRole("button",{name:"許可"}));
    expect(onApproval).toHaveBeenCalledWith("accept");
  });

  it("collects a populated MCP form without preselecting or requiring optional fields", () => {
    const onApproval = vi.fn();
    render(<CodexPanel {...baseProps} onApproval={onApproval} approval={{requestId:"form-1",method:"mcpServer/elicitation/request",kind:"toolUserInput",serverName:"fixture",changes:[],
      questions:[{id:"label",header:"名前",question:"検査名",required:true,inputType:"string"},
        {id:"enabled",header:"有効化",question:"選択",required:true,inputType:"boolean",options:[{label:"true",description:"はい"},{label:"false",description:"いいえ"}]},
        {id:"count",header:"回数",question:"整数",required:true,inputType:"integer"},
        {id:"optional",header:"備考",question:"任意",required:false,inputType:"string"}]}} />);
    const submit = screen.getByRole("button",{name:"回答を送信"});
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("有効化")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("名前の回答"),{target:{value:"検査"}});
    fireEvent.change(screen.getByLabelText("有効化"),{target:{value:"false"}});
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("回数の回答"),{target:{value:"3"}});
    expect(submit).toBeEnabled();
    expect(onApproval).not.toHaveBeenCalled();
    fireEvent.click(submit);
    expect(onApproval).toHaveBeenCalledWith("accept",{label:"検査",enabled:"false",count:"3"});
  });

  it("closes a form without sending entered answers", () => {
    const onApproval = vi.fn();
    render(<CodexPanel {...baseProps} onApproval={onApproval} approval={{requestId:"form-cancel",method:"mcpServer/elicitation/request",kind:"toolUserInput",changes:[],
      questions:[{id:"secret",header:"秘密値",question:"入力",isSecret:true,required:true}]}} />);
    const input = screen.getByLabelText("秘密値の回答");
    expect(input).toHaveAttribute("type","password");
    fireEvent.change(input,{target:{value:"not-for-diagnostics"}});
    fireEvent.click(screen.getByRole("button",{name:"回答せず閉じる"}));
    expect(onApproval).toHaveBeenCalledExactlyOnceWith("cancel");
  });

  it("retains answers while the same request stays pending and resets them for another request", () => {
    const onApproval = vi.fn();
    const approval = {requestId:"form-pending",method:"mcpServer/elicitation/request",kind:"toolUserInput" as const,changes:[],
      questions:[{id:"count",header:"回数",question:"整数",required:true}]};
    const {rerender} = render(<CodexPanel {...baseProps} onApproval={onApproval} approval={approval} />);
    fireEvent.change(screen.getByLabelText("回数の回答"),{target:{value:"invalid-number"}});
    fireEvent.click(screen.getByRole("button",{name:"回答を送信"}));
    rerender(<CodexPanel {...baseProps} onApproval={onApproval} approval={approval} busy />);
    expect(screen.getByLabelText("回数の回答")).toHaveValue("invalid-number");
    rerender(<CodexPanel {...baseProps} onApproval={onApproval} approval={{...approval,requestId:"form-next"}} />);
    expect(screen.getByLabelText("回数の回答")).toHaveValue("");
    expect(screen.getByRole("button",{name:"回答を送信"})).toBeDisabled();
  });

  it("displays a policy denial as system information without creating a user-refusal card", () => {
    render(<CodexPanel {...baseProps} messages={[{id:"policy",role:"system",text:"[editorPolicyDenied] エディタの権限制限により追加権限を付与しませんでした。ユーザーによる拒否ではありません。method=item/permissions/requestApproval requestId=9"}]} />);
    expect(screen.getByText(/ユーザーによる拒否ではありません/)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"拒否"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"許可"})).not.toBeInTheDocument();
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

  it("allows a fresh connection probe when the previous chat protocol check was unavailable", () => {
    render(<CodexPanel {...baseProps} connected={false} threadId={null} chatAvailable={false} />);
    expect(screen.getByRole("button", { name: "Codexに接続" })).toBeEnabled();
    expect(screen.getByText(/接続時にもう一度検査します/)).toBeInTheDocument();
  });

  it("falls back to consultation-only when editing or approvals are unavailable", () => {
    const { container } = render(<CodexPanel {...baseProps} writableAvailable={false} />);
    const select = container.querySelector<HTMLSelectElement>(".approval-mode-label select")!;
    expect(select).toBeDisabled();
    expect(select.value).toBe("consultationOnly");
    expect(screen.getByText(/相談のみに制限します/)).toBeInTheDocument();
  });

  it("shows an editor-owned PHITS run request without a shell command", () => {
    render(<CodexPanel {...baseProps} approval={{
      requestId: "run-1",
      method: "phits/run/requestApproval",
      kind: "phitsRun",
      reason: "編集結果を検証します",
      inputRelativePath: "case.inp",
      cwd: "C:\\work",
      phitsRoot: "C:\\phits",
      phitsVersion: "3.370",
      executionMode: "normal",
      availableDecisions: ["accept", "decline"],
      changes: [],
    }} />);
    expect(screen.getByText("PHITS通常実行の承認")).toBeInTheDocument();
    expect(screen.getByText("case.inp")).toBeInTheDocument();
    expect(screen.getByText("C:\\phits")).toBeInTheDocument();
    expect(screen.getByText(/shell実行権限は渡しません/)).toBeInTheDocument();
  });

  it("explains the bounded autonomous workspace mode", () => {
    const { container } = render(<CodexPanel {...baseProps} approvalMode="autonomousWorkspace" />);
    const select = container.querySelector<HTMLSelectElement>(".approval-mode-label select")!;
    expect(select.value).toBe("autonomousWorkspace");
    expect(screen.getByText(/個別確認なしで許可します/)).toHaveTextContent("ネットワーク");
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
    fireEvent.click(screen.getByText("診断項目と検査理由"));
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

  it("creates a thread before inserting troubleshooting text when none is selected", async () => {
    const onNewThread = vi.fn(() => Promise.resolve("thread-help"));
    const onSend = vi.fn();
    render(<CodexPanel {...baseProps} threadId={null} threads={[]} troubleshootingPrompt="初期相談文" onNewThread={onNewThread} onSend={onSend} phitsAgentSetup={{
      configured: false,
      state: "partial",
      sourcePath: null,
      message: "PHITS側だけ確認しました。",
      checks: [],
    }} />);
    fireEvent.click(screen.getByText("生成AIへの相談文を表示"));
    fireEvent.change(screen.getByRole("textbox", { name: "生成AIへの相談文" }), { target: { value: "確認済み相談文" } });
    fireEvent.click(screen.getByRole("button", { name: "Codex入力欄へ挿入" }));

    await waitFor(() => expect(onNewThread).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByPlaceholderText("[新しいスレッド]をクリックするか、既存スレッドを選択してください")).toHaveValue("確認済み相談文"));
    expect(screen.getByText("新しい相談用スレッドを作成しました。内容を確認して送信してください。")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps troubleshooting text when automatic thread creation fails", async () => {
    const onNewThread = vi.fn(() => Promise.resolve(null));
    render(<CodexPanel {...baseProps} threadId={null} threads={[]} troubleshootingPrompt="保持する相談文" onNewThread={onNewThread} phitsAgentSetup={{
      configured: false,
      state: "partial",
      sourcePath: null,
      message: "PHITS側だけ確認しました。",
      checks: [],
    }} />);
    fireEvent.click(screen.getByText("生成AIへの相談文を表示"));
    fireEvent.click(screen.getByRole("button", { name: "Codex入力欄へ挿入" }));

    await waitFor(() => expect(screen.getByText("相談用スレッドを作成できませんでした。相談文は保持されています。")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "生成AIへの相談文" })).toHaveValue("保持する相談文");
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

  it("does not occupy the panel when every Codex environment check passes", () => {
    render(<CodexPanel {...baseProps} phitsAgentSetup={{
      configured: true,
      state: "confirmed",
      sourcePath: "C:\\Users\\user\\.codex\\AGENTS.md",
      message: "PHITS用Codex設定を確認しました。",
      checks: [],
    }} sandboxReport={{
      state: "available",
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-13T00:00:00Z",
      readiness: "ready",
      allowedImplementations: [],
      checks: [{ id: "workspaceCreate", state: "available", detail: "書込みを確認しました。" }],
      messages: [],
      supportPrompt: "",
    }} />);
    expect(screen.queryByText("Codex編集環境を確認しました")).not.toBeInTheDocument();
    expect(screen.queryByText("診断項目と検査理由")).not.toBeInTheDocument();
  });

  it("adds sandbox failures to the existing connection diagnosis", () => {
    render(<CodexPanel {...baseProps} troubleshootingPrompt="統合診断の相談文" phitsAgentSetup={{
      configured: true,
      state: "confirmed",
      sourcePath: "C:\\Users\\user\\.codex\\AGENTS.md",
      message: "PHITS用Codex設定を確認しました。",
      checks: [{ id: "codexGlobal", state: "confirmed", path: "C:\\Users\\user\\.codex\\AGENTS.md", message: "参照を確認しました。" }],
    }} sandboxReport={{
      state: "unavailable",
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-13T00:00:00Z",
      readiness: "notConfigured",
      implementation: "elevated",
      allowedImplementations: ["elevated"],
      checks: [
        { id: "windowsSandbox", state: "unavailable", detail: "CodexのSandboxが未設定です。" },
        { id: "workspaceCreate", state: "unavailable", detail: "書込みを確認できませんでした。" },
      ],
      messages: [],
      supportPrompt: "統合診断の相談文",
    }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("このワークスペースで書込みを確認できません");
    fireEvent.click(screen.getByText("診断項目と検査理由"));
    expect(alert).toHaveTextContent("PHITS参照設定");
    expect(alert).toHaveTextContent("Sandbox");
    expect(alert).toHaveTextContent("Sandbox方式");
    expect(alert).toHaveTextContent("elevated");
    expect(alert).not.toHaveTextContent("Windows Sandbox");
    expect(alert).toHaveTextContent("ワークスペース直下への作成");
  });

  it("offers actual-edit diagnostics, an explicit Editor override and a retry for a Sandbox setup failure", () => {
    const onRetrySandboxProbe = vi.fn();
    const onStartLiveEditProbe = vi.fn();
    const onEnableEditingOverride = vi.fn();
    render(<CodexPanel {...baseProps} onRetrySandboxProbe={onRetrySandboxProbe} onStartLiveEditProbe={onStartLiveEditProbe} onEnableEditingOverride={onEnableEditingOverride} sandboxReport={{
      state: "unavailable",
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-18T00:00:00Z",
      readiness: "ready",
      implementation: "elevated",
      allowedImplementations: ["elevated"],
      failureCategory: "sandboxSetup",
      checks: [{ id: "workspaceCreate", state: "unavailable", detail: "setup refresh had errors" }],
      messages: [],
      supportPrompt: "",
    }} />);

    expect(screen.queryByRole("button", { name: /再セットアップ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sandbox手順/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "実際のCodex編集経路を確認" }));
    expect(onStartLiveEditProbe).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "診断結果にかかわらず編集を許可" }));
    expect(onEnableEditingOverride).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "再診断" }));
    expect(onRetrySandboxProbe).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("このエディタは端末のSandbox設定を変更しません");
  });

  it("does not recommend machine-wide Sandbox repair for workspace permissions", () => {
    const onRetrySandboxProbe = vi.fn();
    render(<CodexPanel {...baseProps} writableAvailable={false} onRetrySandboxProbe={onRetrySandboxProbe} sandboxReport={{
      state: "unavailable",
      editingAvailable: false,
      workspaceRoot: "C:\\work",
      checkedAt: "2026-09-20T00:00:00Z",
      readiness: "ready",
      implementation: "unelevated",
      allowedImplementations: [],
      failureCategory: "workspacePermissions",
      checks: [{ id: "workspaceCreate", state: "unavailable", detail: "アクセスが拒否されました" }],
      messages: [],
      supportPrompt: "",
    }} />);

    expect(screen.queryByRole("button", { name: /Sandbox手順/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /再セットアップ/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再診断" }));
    expect(onRetrySandboxProbe).toHaveBeenCalledOnce();
    expect(screen.getByText(/実動作検査でワークスペース書込みを確認できない/)).toBeInTheDocument();
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

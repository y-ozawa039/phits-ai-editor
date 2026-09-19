import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ApprovalDecision, ApprovalMode, ApprovalRequest, CodexModel, CodexSandboxProbeReport, CodexThreadLink, PhitsAgentSetupStatus, WorkspaceEnvironmentReport } from "../types";
import { sandboxEditingAvailable, sandboxSetupModes, type CodexSandboxSetupMode } from "../codexSandbox";
import { ApprovalCard } from "./ApprovalCard";
import { Icon } from "./Icons";
import { MessageMarkdown } from "./MessageMarkdown";

export interface ChatMessage { id: string; role: "user" | "assistant" | "system"; text: string; streaming?: boolean }
export interface CodexContextChip { id: string; label: string; warning?: boolean }
export interface ComposerDraftRequest { id: number; text: string }

interface CodexPanelProps {
  open: boolean; width: number; fontSize?: number; connected: boolean; busy: boolean;
  connectionError?: string | null; troubleshootingPrompt?: string | null;
  models: CodexModel[]; model: string; reasoning: string; approvalMode: ApprovalMode;
  sessionApprovalActive?: boolean; threadId: string | null; threads?: CodexThreadLink[];
  chatAvailable?: boolean; threadsAvailable?: boolean; writableAvailable?: boolean;
  phitsAgentSetup?: PhitsAgentSetupStatus | null;
  sandboxReport?: CodexSandboxProbeReport | null; sandboxBusy?: boolean; sandboxSetupBusy?: boolean;
  workspaceEnvironment?: WorkspaceEnvironmentReport | null;
  messages: ChatMessage[]; approval: ApprovalRequest | null; approvalCount?: number;
  contextChips?: CodexContextChip[]; draftRequest?: ComposerDraftRequest | null;
  onToggle: () => void; onResizeStart: (event: React.PointerEvent) => void; onConnect: () => void;
  onDisconnect: () => void; onModelChange: (value: string) => void; onReasoningChange: (value: string) => void;
  onApprovalModeChange: (value: ApprovalMode) => void;
  onNewThread: () => string | null | Promise<string | null>; onResumeThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void; onDeleteThread: (threadId: string, title: string) => void;
  onRemoveContext: (id: string) => void; onSend: (text: string) => boolean | Promise<boolean>;
  onInterrupt: () => void; onApproval: (decision: ApprovalDecision, answers?: Record<string, string>) => void;
  onSandboxSetup?: (mode: CodexSandboxSetupMode) => void;
  onSaveDiagnosticReport?: () => void;
  onOpenDiff?: () => void; onResizeReset?: () => void;
  approvalCanAccept?: boolean;
}

function formatLastUsed(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function CodexPanel(props: CodexPanelProps) {
  const [draft, setDraft] = useState("");
  const [troubleshootingDraft, setTroubleshootingDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [troubleshootingInsertBusy, setTroubleshootingInsertBusy] = useState(false);
  const [menu, setMenu] = useState<{ thread: CodexThreadLink; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const currentModel = props.models.find((entry) => entry.id === props.model);
  const efforts = currentModel?.supportedReasoningEfforts ?? [];
  const activeThread = props.threads?.find((entry) => entry.threadId === props.threadId);
  const sortedThreads = useMemo(() => [...(props.threads ?? [])].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)), [props.threads]);
  const chatAvailable = props.chatAvailable !== false;
  const threadsAvailable = props.threadsAvailable !== false;
  const writableAvailable = props.writableAvailable !== false;

  useEffect(() => { if (props.draftRequest) setDraft(props.draftRequest.text); }, [props.draftRequest]);
  useEffect(() => {
    setTroubleshootingDraft(props.troubleshootingPrompt ?? "");
    setCopyStatus("");
  }, [props.troubleshootingPrompt]);
  useLayoutEffect(() => {
    followLatestRef.current = true;
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [props.threadId]);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && followLatestRef.current) transcript.scrollTop = transcript.scrollHeight;
  }, [props.messages, props.approval]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);

  if (!props.open) return <aside className="codex-rail" style={{ "--codex-font-size": `${props.fontSize ?? 14}px` } as CSSProperties}><button className="codex-rail-button" onClick={props.onToggle} title="Codexパネルを開く"><Icon name="spark" /><span>Codex</span></button></aside>;
  const send = async () => { const text = draft.trim(); if (!text || props.busy) return; followLatestRef.current = true; if (await props.onSend(text)) setDraft(""); };
  const openMenu = (thread: CodexThreadLink, x: number, y: number) => setMenu({ thread, x, y });
  const rename = () => { if (!menu) return; const title = window.prompt("スレッド名", menu.thread.title)?.trim(); if (title && title !== menu.thread.title) props.onRenameThread(menu.thread.threadId, title); setMenu(null); };
  const remove = () => { if (menu) props.onDeleteThread(menu.thread.threadId, menu.thread.title); setMenu(null); };
  const agentSetup = props.phitsAgentSetup;
  const agentSetupNeedsAttention = Boolean(agentSetup && ["mismatch", "missing", "unreadable"].includes(agentSetup.state));
  const agentCheckLabels = { resource: "PHITS AI設定資源", phitsRoot: "PHITSルートの指示", codexGlobal: "Codexグローバル指示", workspace: "ワークスペース指示", rootConsistency: "PHITSルートの整合性" } as const;
  const workspaceDriveLabels = { fixed: "ローカル", removable: "取り外し可能", network: "ネットワーク", optical: "光学ドライブ", ramDisk: "RAMディスク", unknown: "種別不明" } as const;
  const sandboxCheckLabels = { appServer: "Codex App Server", windowsSandbox: "Sandbox準備", commandExecution: "Sandbox内コマンド実行", workspaceCreate: "ワークスペース直下への作成", existingFileWrite: "既存相当ファイルの変更", childDirectoryWrite: "子フォルダーへの作成", workspacePermissions: "フォルダーのアクセス規則" } as const;
  const sandbox = props.sandboxReport;
  const sandboxWritable = sandboxEditingAvailable(sandbox);
  const setupModes = sandboxSetupModes(sandbox);
  const sandboxNeedsAttention = Boolean(sandbox && sandbox.state !== "available");
  const environmentNeedsAttention = Boolean(agentSetup?.configured === false || sandboxNeedsAttention);
  const workspaceEnvironmentNeedsAttention = props.workspaceEnvironment?.state === "attention";
  const environmentIsAlert = agentSetupNeedsAttention || sandbox?.state === "unavailable";
  const environmentTitle = sandbox?.state === "unavailable"
    ? sandbox.failureCategory === "sandboxSetup"
      ? "Sandbox設定を再構築できる可能性があります"
      : "このワークスペースで書込みを確認できません"
    : sandbox?.state === "limited"
      ? "Codex編集環境を確認してください"
      : agentSetup?.state === "partial"
        ? "PHITS用Codex設定を一部確認しました"
        : "PHITS用Codex設定を確認してください";
  const environmentMessage = sandbox?.state === "unavailable"
    ? sandbox.failureCategory === "workspacePermissions"
      ? "現在のSandbox方式とこのフォルダーの組み合わせで、書込み権限が反映されていない可能性があります。"
      : "Codexとの会話は利用できますが、Sandbox内のコマンド実行またはワークスペース書込みを確認できませんでした。"
    : sandbox?.state === "limited"
      ? "Codexとの会話と編集は利用できる可能性がありますが、Sandboxの準備状態に確認事項があります。"
      : agentSetup?.message ?? "Codex編集環境を確認してください。";
  const copyTroubleshootingPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(troubleshootingDraft);
      setCopyStatus("相談文をコピーしました。");
    } catch {
      setCopyStatus("コピーできませんでした。文章を選択してコピーしてください。");
    }
  };
  const insertTroubleshootingPrompt = async () => {
    if (!troubleshootingDraft.trim() || troubleshootingInsertBusy || props.busy) return;
    setCopyStatus("");
    if (!props.threadId) {
      if (!threadsAvailable) {
        setCopyStatus("新しいスレッドを作成できません。相談文をコピーして利用してください。");
        return;
      }
      setTroubleshootingInsertBusy(true);
      try {
        const createdThreadId = await props.onNewThread();
        if (!createdThreadId) {
          setCopyStatus("相談用スレッドを作成できませんでした。相談文は保持されています。");
          return;
        }
        setCopyStatus("新しい相談用スレッドを作成しました。内容を確認して送信してください。");
      } catch {
        setCopyStatus("相談用スレッドを作成できませんでした。相談文は保持されています。");
        return;
      } finally {
        setTroubleshootingInsertBusy(false);
      }
    }
    setDraft(troubleshootingDraft);
  };
  const troubleshootingEditor = props.troubleshootingPrompt ? <details className="codex-troubleshooting-details"><summary>生成AIへの相談文を表示</summary><p>送信前に内容とパスを確認し、必要に応じて編集してください。</p>{!props.connected && <p className="desktop-codex-guidance">ChatGPTデスクトップ版でCodexを開き、このPCを利用するローカルタスクへ次の文章を貼り付けてください。Cloudタスクではローカルファイルを確認できない場合があります。</p>}<textarea aria-label="生成AIへの相談文" rows={10} value={troubleshootingDraft} onChange={(event) => { setTroubleshootingDraft(event.target.value); setCopyStatus(""); }} /><div className="troubleshooting-actions"><button className="secondary-button" onClick={() => void copyTroubleshootingPrompt()}>相談文をコピー</button>{props.connected && <button className="secondary-button" onClick={() => void insertTroubleshootingPrompt()} disabled={troubleshootingInsertBusy || props.busy || !chatAvailable || (!props.threadId && !threadsAvailable) || !troubleshootingDraft.trim()}>{troubleshootingInsertBusy ? "相談用スレッドを準備中…" : "Codex入力欄へ挿入"}</button>}<span aria-live="polite">{copyStatus}</span></div></details> : null;
  const setupNeedsExplanation = environmentNeedsAttention || workspaceEnvironmentNeedsAttention;

  return <aside className="codex-panel" style={{ width: props.width, "--codex-font-size": `${props.fontSize ?? 14}px` } as CSSProperties} aria-label="Codex">
    <div className="vertical-resizer" onPointerDown={props.onResizeStart} onDoubleClick={props.onResizeReset} title="ドラッグで幅を変更・ダブルクリックで既定幅" />
    <header className="codex-titlebar"><div className="panel-title codex-brand"><span className="brand-mark"><Icon name="spark" /></span>Codex</div><div className={`connection-state ${props.connected ? "online" : ""}`}><span />{props.connected ? "接続済み" : "未接続"}</div><button className="icon-button" onClick={props.onToggle} aria-label="Codexパネルを閉じる"><Icon name="panel" /></button></header>
    <div className="codex-controls">
      {(environmentNeedsAttention || workspaceEnvironmentNeedsAttention) && <div className={`codex-compatibility-note codex-agent-setup-note ${sandbox?.state ?? agentSetup?.state ?? "partial"}`} role={environmentIsAlert ? "alert" : "status"}><strong>{environmentNeedsAttention ? environmentTitle : "ワークスペースの保存場所を確認してください"}</strong><span>{environmentNeedsAttention ? environmentMessage : "保存場所の種類または属性に確認事項があります。編集可否はCodex接続時の実動作検査で確認します。"}</span><details><summary>診断項目と検査理由</summary>{agentSetup && <div className="codex-diagnostic-group"><b>PHITS参照設定</b><ul>{agentSetup.checks.map((check) => <li className={`agent-setup-check ${check.state}`} key={check.id}><b>{agentCheckLabels[check.id]}</b><span>{check.message}</span>{check.path && <code>{check.path}</code>}</li>)}</ul></div>}{props.workspaceEnvironment && <div className="codex-diagnostic-group"><b>ワークスペース保存場所</b><ul><li className={`agent-setup-check ${props.workspaceEnvironment.state === "normal" ? "confirmed" : "partial"}`}><b>{workspaceDriveLabels[props.workspaceEnvironment.driveKind]}{props.workspaceEnvironment.fileSystem ? ` / ${props.workspaceEnvironment.fileSystem}` : ""}</b><span>{props.workspaceEnvironment.messages.join(" ") || "明確な注意事項はありません。"}</span></li></ul></div>}{sandbox && <div className="codex-diagnostic-group"><b>Codex編集環境</b><ul>{sandbox.checks.map((check) => <li className={`agent-setup-check ${check.state}`} key={check.id}><b>{sandboxCheckLabels[check.id]}</b><span>{check.detail}</span></li>)}<li className={`agent-setup-check ${sandbox.implementation ? "confirmed" : "partial"}`}><b>Sandbox方式</b><span>{sandbox.implementation ?? "取得できませんでした"}</span></li><li className={`agent-setup-check ${sandbox.writePolicy ? "confirmed" : "partial"}`}><b>書込み方針</b><span>{sandbox.writePolicy === "explicitRoot" ? "明示ルート" : sandbox.writePolicy === "workspaceCwd" ? "作業フォルダー" : "確認できませんでした"}</span></li><li className="agent-setup-check confirmed"><b>組織ポリシーの許可方式</b><span>{sandbox.allowedImplementations.length ? sandbox.allowedImplementations.join(", ") : "制限指定なし"}</span></li></ul></div>}</details>{setupModes.length > 0 && props.onSandboxSetup && <div className="sandbox-setup-options">{setupModes.map((mode, index) => <button className="secondary-button" key={mode} onClick={() => props.onSandboxSetup?.(mode)} disabled={props.sandboxSetupBusy || props.sandboxBusy}>{props.sandboxSetupBusy ? "Sandboxを再セットアップ中…" : mode === "elevated" ? `elevatedで再セットアップ${index === 0 ? "（推奨）" : ""}` : "unelevatedで再セットアップ"}</button>)}<span>Codex公式のセットアップを使用し、完了後に自動で再診断します。フォルダーのアクセス許可は直接変更しません。</span></div>}{props.onSaveDiagnosticReport && <div className="troubleshooting-actions"><button className="secondary-button" onClick={props.onSaveDiagnosticReport}>診断レポートを保存…</button></div>}{props.sandboxBusy && <span aria-live="polite">Codex編集環境を診断中…</span>}{troubleshootingEditor}</div>}
      {!props.connected ? <><button className="primary-button wide" onClick={props.onConnect} disabled={props.busy}>Codexに接続</button>{!chatAvailable && !props.connectionError && <div className="codex-compatibility-note">App Serverの会話機能に互換性がありません。接続時にもう一度検査します。</div>}{props.connectionError && <div className="codex-compatibility-note codex-connection-error" role="alert"><strong>Codexに接続できませんでした</strong><span>{props.connectionError}</span>{!setupNeedsExplanation && props.onSaveDiagnosticReport && <div className="troubleshooting-actions"><button className="secondary-button" onClick={props.onSaveDiagnosticReport}>診断レポートを保存…</button></div>}{!setupNeedsExplanation && troubleshootingEditor}</div>}</> : <>
      <div className="select-row"><label>モデル<select value={props.model} onChange={(e) => props.onModelChange(e.target.value)}>{props.models.map((entry) => <option value={entry.id} key={entry.id}>{entry.displayName}</option>)}</select></label><label>思考<select value={props.reasoning} onChange={(e) => props.onReasoningChange(e.target.value)} disabled={!efforts.length}>{efforts.map((effort) => <option value={effort} key={effort}>{effort}</option>)}</select></label></div>
      <label className="approval-mode-label">アクションの承認<select value={writableAvailable ? props.approvalMode : "consultationOnly"} disabled={!writableAvailable} onChange={(e) => props.onApprovalModeChange(e.target.value as ApprovalMode)}><option value="confirmFirst">確認優先</option><option value="consultationOnly">相談のみ</option><option value="onRequest">必要時のみ確認</option><option value="autonomousWorkspace">自律実行（ワークスペース内）</option></select></label>
      {props.approvalMode === "autonomousWorkspace" && writableAvailable && <div className="session-grant-note">ワークスペース内の検証済み編集と、現在の保存済み入力のPHITS通常実行を個別確認なしで許可します。ネットワーク、範囲外書込み、PHITSの直接コマンド実行は許可されません。</div>}
      {!writableAvailable && <div className="codex-compatibility-note">{sandbox && !sandboxWritable ? "Sandbox内の実動作検査でワークスペース書込みを確認できないため、この接続では相談のみに制限します。" : "編集または承認Schemaに互換性がないため、この接続では相談のみに制限します。"}</div>}
      {props.sessionApprovalActive && <div className="session-grant-note">この接続中の許可が有効です</div>}
      <div className="thread-row"><button className="secondary-button" onClick={() => void props.onNewThread()} disabled={props.busy || !threadsAvailable}>新しいスレッド</button><button className="text-button subtle" onClick={props.onDisconnect}>切断</button></div>
      {threadsAvailable ? <details className="resume-details"><summary>既存スレッドを再開</summary><div className="saved-threads">{sortedThreads.length ? sortedThreads.map((thread) => <button className={`saved-thread ${thread.threadId === props.threadId ? "active" : ""}`} key={thread.threadId} onClick={() => props.onResumeThread(thread.threadId)} onContextMenu={(event) => { event.preventDefault(); openMenu(thread, event.clientX, event.clientY); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(thread, rect.left + 20, rect.bottom); } }} title="右クリックで名前変更・削除"><span>{thread.title}</span><small>{formatLastUsed(thread.lastUsedAt)}</small></button>) : <span className="empty-thread-list">保存されたスレッドはありません</span>}</div></details> : <div className="codex-compatibility-note">スレッド機能は利用できません。</div>}
    </>}</div>
    {props.threadId && <div className="thread-badge" title={props.threadId}>{activeThread?.title ?? "新しい会話"}</div>}
    <div ref={transcriptRef} className="chat-transcript" aria-live="polite" onScroll={(event) => { const element = event.currentTarget; followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 48; }}>{props.messages.length === 0 ? <div className="codex-empty"><div className="codex-orb"><Icon name="spark" /></div><strong>入力を一緒に仕上げましょう</strong><p>現在のファイルや選択範囲を含めて相談できます。</p></div> : props.messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><div className="message-role">{message.role === "user" ? "あなた" : message.role === "assistant" ? "Codex" : "システム"}</div><div className="message-text"><MessageMarkdown text={message.text} />{message.streaming && <span className="stream-caret" />}</div></article>)}</div>
    {props.approval && <ApprovalCard approval={props.approval} queuedCount={props.approvalCount ?? 1} fontSize={props.fontSize ?? 14} onDecision={props.onApproval} onOpenDiff={props.onOpenDiff} allowApproval={props.approvalCanAccept} />}
    <div className="composer">{!!props.contextChips?.length && <div className="context-chips" aria-label="送信するEditorコンテキスト">{props.contextChips.map((chip) => <span className={`context-chip ${chip.warning ? "warning" : ""}`} key={chip.id}>{chip.label}<button aria-label={`${chip.label}をコンテキストから外す`} onClick={() => props.onRemoveContext(chip.id)}>×</button></span>)}</div>}<textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={props.connected ? (props.threadId ? "Codexにメッセージを送信…" : "[新しいスレッド]をクリックするか、既存スレッドを選択してください") : "先にCodexへ接続してください"} disabled={!props.connected || !props.threadId || !chatAvailable} /><div className="composer-footer"><span>Enterで送信 · Shift+Enterで改行</span>{props.busy ? <button className="stop-chat-button" onClick={props.onInterrupt}><Icon name="stop" />中断</button> : <button className="send-button" onClick={() => void send()} disabled={!draft.trim() || !props.threadId || !chatAvailable}><span>送信</span>↑</button>}</div></div>
    {menu && <div ref={menuRef} className="thread-context-menu" role="menu" style={{ left: menu.x, top: menu.y }}><button role="menuitem" onClick={rename}>名前を変更</button><button role="menuitem" className="danger" onClick={remove}>完全に削除</button></div>}
  </aside>;
}

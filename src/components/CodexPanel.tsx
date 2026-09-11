import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ApprovalDecision, ApprovalMode, ApprovalRequest, CodexModel, CodexThreadLink, PhitsAgentSetupStatus } from "../types";
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
  messages: ChatMessage[]; approval: ApprovalRequest | null; approvalCount?: number;
  contextChips?: CodexContextChip[]; draftRequest?: ComposerDraftRequest | null;
  onToggle: () => void; onResizeStart: (event: React.PointerEvent) => void; onConnect: () => void;
  onDisconnect: () => void; onModelChange: (value: string) => void; onReasoningChange: (value: string) => void;
  onApprovalModeChange: (value: ApprovalMode) => void; onNewThread: () => void; onResumeThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void; onDeleteThread: (threadId: string, title: string) => void;
  onRemoveContext: (id: string) => void; onSend: (text: string) => boolean | Promise<boolean>;
  onInterrupt: () => void; onApproval: (decision: ApprovalDecision) => void;
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
  const agentSetupTitle = agentSetup?.state === "partial" ? "PHITS用Codex設定を一部確認しました" : "PHITS用Codex設定を確認してください";
  const agentCheckLabels = { resource: "PHITS AI設定資源", phitsRoot: "PHITSルートの指示", codexGlobal: "Codexグローバル指示", workspace: "ワークスペース指示", rootConsistency: "PHITSルートの整合性" } as const;
  const copyTroubleshootingPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(troubleshootingDraft);
      setCopyStatus("相談文をコピーしました。");
    } catch {
      setCopyStatus("コピーできませんでした。文章を選択してコピーしてください。");
    }
  };
  const troubleshootingEditor = props.troubleshootingPrompt ? <details className="codex-troubleshooting-details"><summary>生成AIへの相談文を表示</summary><p>送信前に内容とパスを確認し、必要に応じて編集してください。</p>{!props.connected && <p className="desktop-codex-guidance">ChatGPTデスクトップ版でCodexを開き、このPCを利用するローカルタスクへ次の文章を貼り付けてください。Cloudタスクではローカルファイルを確認できない場合があります。</p>}<textarea aria-label="生成AIへの相談文" rows={10} value={troubleshootingDraft} onChange={(event) => { setTroubleshootingDraft(event.target.value); setCopyStatus(""); }} /><div className="troubleshooting-actions"><button className="secondary-button" onClick={() => void copyTroubleshootingPrompt()}>相談文をコピー</button>{props.connected && <button className="secondary-button" onClick={() => setDraft(troubleshootingDraft)}>Codex入力欄へ挿入</button>}<span aria-live="polite">{copyStatus}</span></div></details> : null;
  const setupNeedsExplanation = Boolean(agentSetup && !agentSetup.configured);

  return <aside className="codex-panel" style={{ width: props.width, "--codex-font-size": `${props.fontSize ?? 14}px` } as CSSProperties} aria-label="Codex">
    <div className="vertical-resizer" onPointerDown={props.onResizeStart} onDoubleClick={props.onResizeReset} title="ドラッグで幅を変更・ダブルクリックで既定幅" />
    <header className="codex-titlebar"><div className="panel-title codex-brand"><span className="brand-mark"><Icon name="spark" /></span>Codex</div><div className={`connection-state ${props.connected ? "online" : ""}`}><span />{props.connected ? "接続済み" : "未接続"}</div><button className="icon-button" onClick={props.onToggle} aria-label="Codexパネルを閉じる"><Icon name="panel" /></button></header>
    <div className="codex-controls">
      {agentSetup && !agentSetup.configured && <div className={`codex-compatibility-note codex-agent-setup-note ${agentSetup.state}`} role={agentSetupNeedsAttention ? "alert" : "status"}><strong>{agentSetupTitle}</strong><span>{agentSetup.message}</span><details><summary>検査したファイルと理由</summary><ul>{agentSetup.checks.map((check) => <li className={`agent-setup-check ${check.state}`} key={check.id}><b>{agentCheckLabels[check.id]}</b><span>{check.message}</span>{check.path && <code>{check.path}</code>}</li>)}</ul></details>{troubleshootingEditor}</div>}
      {!props.connected ? <><button className="primary-button wide" onClick={props.onConnect} disabled={props.busy || !chatAvailable}>Codexに接続</button>{!chatAvailable && !props.connectionError && <div className="codex-compatibility-note">App Serverの会話機能に互換性がありません。実行環境の診断を確認してください。</div>}{props.connectionError && <div className="codex-compatibility-note codex-connection-error" role="alert"><strong>Codexに接続できませんでした</strong><span>{props.connectionError}</span>{!setupNeedsExplanation && troubleshootingEditor}</div>}</> : <>
      <div className="select-row"><label>モデル<select value={props.model} onChange={(e) => props.onModelChange(e.target.value)}>{props.models.map((entry) => <option value={entry.id} key={entry.id}>{entry.displayName}</option>)}</select></label><label>思考<select value={props.reasoning} onChange={(e) => props.onReasoningChange(e.target.value)} disabled={!efforts.length}>{efforts.map((effort) => <option value={effort} key={effort}>{effort}</option>)}</select></label></div>
      <label className="approval-mode-label">アクションの承認<select value={writableAvailable ? props.approvalMode : "consultationOnly"} disabled={!writableAvailable} onChange={(e) => props.onApprovalModeChange(e.target.value as ApprovalMode)}><option value="confirmFirst">確認優先</option><option value="consultationOnly">相談のみ</option><option value="onRequest">必要時のみ確認</option></select></label>
      {!writableAvailable && <div className="codex-compatibility-note">編集または承認Schemaに互換性がないため、この接続では相談のみに制限します。</div>}
      {props.sessionApprovalActive && <div className="session-grant-note">この接続中の許可が有効です</div>}
      <div className="thread-row"><button className="secondary-button" onClick={props.onNewThread} disabled={props.busy || !threadsAvailable}>新しいスレッド</button><button className="text-button subtle" onClick={props.onDisconnect}>切断</button></div>
      {threadsAvailable ? <details className="resume-details"><summary>既存スレッドを再開</summary><div className="saved-threads">{sortedThreads.length ? sortedThreads.map((thread) => <button className={`saved-thread ${thread.threadId === props.threadId ? "active" : ""}`} key={thread.threadId} onClick={() => props.onResumeThread(thread.threadId)} onContextMenu={(event) => { event.preventDefault(); openMenu(thread, event.clientX, event.clientY); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(thread, rect.left + 20, rect.bottom); } }} title="右クリックで名前変更・削除"><span>{thread.title}</span><small>{formatLastUsed(thread.lastUsedAt)}</small></button>) : <span className="empty-thread-list">保存されたスレッドはありません</span>}</div></details> : <div className="codex-compatibility-note">スレッド機能は利用できません。</div>}
    </>}</div>
    {props.threadId && <div className="thread-badge" title={props.threadId}>{activeThread?.title ?? "新しい会話"}</div>}
    <div ref={transcriptRef} className="chat-transcript" aria-live="polite" onScroll={(event) => { const element = event.currentTarget; followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 48; }}>{props.messages.length === 0 ? <div className="codex-empty"><div className="codex-orb"><Icon name="spark" /></div><strong>入力を一緒に仕上げましょう</strong><p>現在のファイルや選択範囲を含めて相談できます。</p></div> : props.messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><div className="message-role">{message.role === "user" ? "あなた" : message.role === "assistant" ? "Codex" : "システム"}</div><div className="message-text"><MessageMarkdown text={message.text} />{message.streaming && <span className="stream-caret" />}</div></article>)}</div>
    {props.approval && <ApprovalCard approval={props.approval} queuedCount={props.approvalCount ?? 1} fontSize={props.fontSize ?? 14} onDecision={props.onApproval} onOpenDiff={props.onOpenDiff} allowApproval={props.approvalCanAccept} />}
    <div className="composer">{!!props.contextChips?.length && <div className="context-chips" aria-label="送信するEditorコンテキスト">{props.contextChips.map((chip) => <span className={`context-chip ${chip.warning ? "warning" : ""}`} key={chip.id}>{chip.label}<button aria-label={`${chip.label}をコンテキストから外す`} onClick={() => props.onRemoveContext(chip.id)}>×</button></span>)}</div>}<textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={props.connected ? (props.threadId ? "Codexにメッセージを送信…" : "[新しいスレッド]をクリックするか、既存スレッドを選択してください") : "先にCodexへ接続してください"} disabled={!props.connected || !props.threadId || !chatAvailable} /><div className="composer-footer"><span>Enterで送信 · Shift+Enterで改行</span>{props.busy ? <button className="stop-chat-button" onClick={props.onInterrupt}><Icon name="stop" />中断</button> : <button className="send-button" onClick={() => void send()} disabled={!draft.trim() || !props.threadId || !chatAvailable}><span>送信</span>↑</button>}</div></div>
    {menu && <div ref={menuRef} className="thread-context-menu" role="menu" style={{ left: menu.x, top: menu.y }}><button role="menuitem" onClick={rename}>名前を変更</button><button role="menuitem" className="danger" onClick={remove}>完全に削除</button></div>}
  </aside>;
}

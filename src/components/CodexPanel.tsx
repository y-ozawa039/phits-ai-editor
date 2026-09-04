import { useState } from "react";
import type { ApprovalRequest, CodexModel, CodexThreadLink } from "../types";
import { Icon } from "./Icons";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
}

interface CodexPanelProps {
  open: boolean;
  width: number;
  connected: boolean;
  busy: boolean;
  models: CodexModel[];
  model: string;
  reasoning: string;
  threadId: string | null;
  threads?: CodexThreadLink[];
  messages: ChatMessage[];
  approval: ApprovalRequest | null;
  onToggle: () => void;
  onResizeStart: (event: React.PointerEvent) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onNewThread: () => void;
  onResumeThread: (threadId: string) => void;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  onApproval: (decision: "accept" | "decline") => void;
}

function stringifyDetails(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CodexPanel(props: CodexPanelProps) {
  const [draft, setDraft] = useState("");
  const [resumeId, setResumeId] = useState("");
  const currentModel = props.models.find((entry) => entry.id === props.model);
  const efforts = currentModel?.supportedReasoningEfforts ?? [];

  if (!props.open) {
    return (
      <aside className="codex-rail">
        <button className="codex-rail-button" onClick={props.onToggle} title="Codexパネルを開く">
          <Icon name="spark" />
          <span>Codex</span>
        </button>
      </aside>
    );
  }

  const send = () => {
    const text = draft.trim();
    if (!text || props.busy) return;
    props.onSend(text);
    setDraft("");
  };

  return (
    <aside className="codex-panel" style={{ width: props.width }} aria-label="Codex">
      <div className="vertical-resizer" onPointerDown={props.onResizeStart} />
      <header className="codex-titlebar">
        <div className="panel-title codex-brand"><span className="brand-mark"><Icon name="spark" /></span>Codex</div>
        <div className={`connection-state ${props.connected ? "online" : ""}`}><span />{props.connected ? "接続済み" : "未接続"}</div>
        <button className="icon-button" onClick={props.onToggle} aria-label="Codexパネルを閉じる"><Icon name="panel" /></button>
      </header>

      <div className="codex-controls">
        {!props.connected ? (
          <button className="primary-button wide" onClick={props.onConnect} disabled={props.busy}>Codexに接続</button>
        ) : (
          <>
            <div className="select-row">
              <label>モデル
                <select value={props.model} onChange={(e) => props.onModelChange(e.target.value)}>
                  {props.models.map((entry) => <option value={entry.id} key={entry.id}>{entry.displayName}</option>)}
                </select>
              </label>
              <label>思考
                <select value={props.reasoning} onChange={(e) => props.onReasoningChange(e.target.value)} disabled={!efforts.length}>
                  {efforts.map((effort) => <option value={effort} key={effort}>{effort}</option>)}
                </select>
              </label>
            </div>
            <div className="thread-row">
              <button className="secondary-button" onClick={props.onNewThread} disabled={props.busy}>新しいスレッド</button>
              <button className="text-button subtle" onClick={props.onDisconnect}>切断</button>
            </div>
            <details className="resume-details">
              <summary>既存スレッドを再開</summary>
              {!!props.threads?.length && <div className="saved-threads">
                {props.threads.map((thread) => <button className="text-button" key={thread.threadId} onClick={() => props.onResumeThread(thread.threadId)} title={thread.threadId}>{thread.title}</button>)}
              </div>}
              <div className="resume-form">
                <input value={resumeId} onChange={(e) => setResumeId(e.target.value)} placeholder="スレッドID" />
                <button className="secondary-button" disabled={!resumeId.trim()} onClick={() => props.onResumeThread(resumeId.trim())}>再開</button>
              </div>
            </details>
          </>
        )}
      </div>

      {props.threadId && <div className="thread-badge" title={props.threadId}>スレッド <span>{props.threadId}</span></div>}

      <div className="chat-transcript" aria-live="polite">
        {props.messages.length === 0 ? (
          <div className="codex-empty"><div className="codex-orb"><Icon name="spark" /></div><strong>入力を一緒に仕上げましょう</strong><p>PHITS入力の相談や、承認付きの編集を依頼できます。</p></div>
        ) : props.messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <div className="message-role">{message.role === "user" ? "あなた" : message.role === "assistant" ? "Codex" : "システム"}</div>
            <div className="message-text">{message.text}{message.streaming && <span className="stream-caret" />}</div>
          </article>
        ))}
      </div>

      {props.approval && (
        <section className="approval-card" aria-label="Codex承認要求">
          <div className="approval-heading"><span className="approval-icon">!</span><strong>承認が必要です</strong></div>
          <p>{props.approval.method}</p>
          <details><summary>対象と詳細を確認</summary><pre>{stringifyDetails(props.approval.params)}</pre></details>
          <div className="approval-actions">
            <button className="danger-ghost-button" onClick={() => props.onApproval("decline")}>拒否</button>
            <button className="primary-button" onClick={() => props.onApproval("accept")}>承認</button>
          </div>
        </section>
      )}

      <div className="composer">
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={props.connected ? (props.threadId ? "Codexにメッセージを送信…" : "新しいスレッドを開始してください") : "先にCodexへ接続してください"}
          disabled={!props.connected || !props.threadId}
        />
        <div className="composer-footer">
          <span>Enterで送信 · Shift+Enterで改行</span>
          {props.busy ? <button className="stop-chat-button" onClick={props.onInterrupt}><Icon name="stop" />中断</button> : <button className="send-button" onClick={send} disabled={!draft.trim() || !props.threadId}><span>送信</span>↑</button>}
        </div>
      </div>
    </aside>
  );
}

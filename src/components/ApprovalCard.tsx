import { useEffect, useState } from "react";
import { approvalRequestKey, changeKindLabel, stripAnsi } from "../codexApproval";
import type { ApprovalDecision, ApprovalRequest } from "../types";
import { approvalExplanation, approvalScopeExplanation } from "../approvalExplanation";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  queuedCount: number;
  fontSize: number;
  onDecision: (decision: ApprovalDecision, answers?: Record<string, string>) => void;
  onOpenDiff?: () => void;
  allowApproval?: boolean;
}

function shortId(value?: string): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function actionLines(actions?: unknown[] | null): string[] {
  if (!actions) return [];
  return actions.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const action = value as Record<string, unknown>;
    const command = typeof action.command === "string" ? stripAnsi(action.command) : "";
    const path = typeof action.path === "string" ? action.path : "";
    const query = typeof action.query === "string" ? action.query : "";
    switch (action.type) {
      case "read": return [`読み取り: ${path || command}`];
      case "listFiles": return [`ファイル一覧: ${path || "作業ディレクトリ"}`];
      case "search": return [`検索: ${query || command}${path ? ` (${path})` : ""}`];
      default: return command ? [`実行: ${command}`] : [];
    }
  });
}

function permissionLines(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`${prefix || "値"}: ${String(value)}`];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => permissionLines(entry, `${prefix || "項目"} ${index + 1}`));
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => permissionLines(entry, prefix ? `${prefix}.${key}` : key));
}

export function ApprovalCard({ approval, queuedCount, onDecision, onOpenDiff, allowApproval = true }: ApprovalCardProps) {
  const [selectedPath, setSelectedPath] = useState(approval.changes[0]?.path ?? "");
  const [allowDecision, setAllowDecision] = useState<ApprovalDecision>("accept");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  useEffect(() => setAnswers({}), [approval]);
  useEffect(() => setSelectedPath(approval.changes[0]?.path ?? ""), [approval]);
  useEffect(() => setAllowDecision(approval.availableDecisions?.includes("accept") ? "accept" : approval.availableDecisions?.find((value) => value === "acceptForSession" || value === "acceptWithExecPolicyAmendment") ?? "accept"), [approval]);
  const selectedChange = approval.changes.find((change) => change.path === selectedPath) ?? approval.changes[0];
  const network = typeof approval.networkApprovalContext === "object" && approval.networkApprovalContext !== null
    ? approval.networkApprovalContext as Record<string, unknown>
    : null;
  const permissions = [
    ...permissionLines(approval.additionalPermissions, "追加権限"),
  ];
  const commandRule = Array.isArray(approval.proposedExecpolicyAmendment) && approval.proposedExecpolicyAmendment.every((v) => typeof v === "string")
    ? approval.proposedExecpolicyAmendment as string[] : null;
  const actions = actionLines(approval.commandActions);
  const hasAllowDecision = approval.availableDecisions?.some((value) => value === "accept" || value === "acceptForSession" || value === "acceptWithExecPolicyAmendment") ?? false;

  return (
    <section className="approval-card" aria-label="Codex承認要求" data-request-key={approvalRequestKey(approval)}>
      <div className="approval-heading">
        <span className="approval-icon">!</span>
        <div><strong>{approval.kind === "mcpToolApproval" ? "MCPツール利用の承認" : approval.kind === "toolUserInput" ? "ツールからの確認・入力" : approval.kind === "fileChange" ? "ファイル変更の承認" : approval.kind === "phitsRun" ? "PHITS通常実行の承認" : network ? "ネットワーク利用の承認" : "コマンド実行の承認"}</strong><small>{queuedCount > 1 ? `残り ${queuedCount} 件` : "内容を確認してください"}</small></div>
      </div>

      <div className="approval-scroll-body">
        <p className="approval-explanation">{approvalExplanation(approval)}</p>
        {approval.reason && <p className="approval-reason">{stripAnsi(approval.reason)}</p>}

        {approval.kind === "fileChange" ? (
          <div className="approval-diff">
            {approval.changes.length > 1 && (
              <div className="approval-file-tabs" aria-label="変更ファイル">
                {approval.changes.map((change) => <button className={change.path === selectedChange?.path ? "active" : ""} key={change.path} onClick={() => setSelectedPath(change.path)}>{change.path}</button>)}
              </div>
            )}
            {selectedChange ? (
              <>
                <div className="approval-file-heading"><strong>{selectedChange.path}</strong><span>{changeKindLabel(selectedChange.kind)}</span></div>
                <div className="approval-diff-summary"><span>{approval.changes.length}ファイルの変更案</span>{onOpenDiff && <button className="secondary-button" onClick={onOpenDiff}>エディターで差分を確認</button>}</div>
              </>
            ) : approval.turnDiff ? (
              <pre className="unified-diff-preview" aria-label="統合差分">{stripAnsi(approval.turnDiff)}</pre>
            ) : (
              <p className="approval-warning">個別差分を取得できませんでした。対象と理由を確認し、不明な場合は拒否してください。</p>
            )}
            {approval.grantRoot && <div className="approval-field"><span>書き込み許可範囲</span><code>{approval.grantRoot}</code></div>}
          </div>
        ) : approval.kind === "phitsRun" ? (
          <div className="command-approval-details">
            <div className="approval-field"><span>入力ファイル</span><code>{approval.inputRelativePath || "不明"}</code></div>
            <div className="approval-field"><span>作業ディレクトリ</span><code>{approval.cwd || approval.workspaceRoot || "不明"}</code></div>
            <div className="approval-field"><span>PHITSルート</span><code>{approval.phitsRoot || "不明"}</code></div>
            <div className="approval-field"><span>PHITSバージョン</span><code>{approval.phitsVersion || "取得できませんでした"}</code></div>
            <p className="approval-warning">エディタが検証済みの公式ラッパーを使って通常実行します。Codexへshell実行権限は渡しません。</p>
          </div>
        ) : approval.kind === "mcpToolApproval" ? (
          <div className="command-approval-details">
            <div className="approval-field"><span>MCPサーバー</span><code>{approval.serverName || "不明"}</code></div>
            {approval.toolDescription && <div className="approval-field"><span>ツールの説明（要求元）</span><p>{stripAnsi(approval.toolDescription)}</p></div>}
            {approval.toolArguments != null && <div className="approval-field"><span>ツールへ渡す引数</span><pre>{JSON.stringify(approval.toolArguments, null, 2)}</pre></div>}
          </div>
        ) : approval.kind === "toolUserInput" ? (
          <div className="command-approval-details">
            {approval.serverName && <div className="approval-field"><span>MCPサーバー</span><code>{approval.serverName}</code></div>}
            {approval.questions?.map((question) => <div className="approval-field" key={question.id}>
              <label htmlFor={`tool-input-${question.id}`}>{question.header}: {question.question}{question.required !== false ? "（必須）" : "（任意）"}</label>
              {!!question.options?.length && <><select id={`tool-input-${question.id}`} aria-label={question.header} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}>
                <option value="">選択してください</option>
                {question.options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
              </select><ul>{question.options.map((option) => <li key={option.label}>{option.label}: {option.description}</li>)}</ul></>}
              {(!question.options?.length || question.isOther) && <input id={question.options?.length ? undefined : `tool-input-${question.id}`} aria-label={`${question.header}の回答`} type={question.isSecret ? "password" : "text"} value={answers[question.id] ?? ""} placeholder={question.isOther ? "選択肢以外の回答も入力できます" : "回答を入力してください"} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />}
            </div>)}
          </div>
        ) : (
          <div className="command-approval-details">
            <div className="approval-field"><span>コマンド</span><code>{stripAnsi(approval.command || "コマンド詳細なし")}</code></div>
            <div className="approval-field"><span>作業ディレクトリ</span><code>{approval.cwd || approval.workspaceRoot || "不明"}</code></div>
            {!!actions.length && <div className="approval-field"><span>想定される操作</span><ul>{actions.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul></div>}
            {network && <div className="approval-field"><span>ネットワーク接続先</span><code>{String(network.protocol ?? "network")}://{String(network.host ?? "不明")}</code></div>}
            {!!permissions.length && <div className="approval-field"><span>要求される追加権限</span><ul>{permissions.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul></div>}
            {commandRule && <div className="approval-field"><span>今後の承認を省略するコマンド規則（候補）</span><code>{commandRule.join(" ")}</code><small>コマンドの先頭部分に一致する要求へ適用されます。「今回のみ許可」では、この規則を追加しません。</small><details><summary>規則の正確な引数一覧</summary><pre>{JSON.stringify(commandRule, null, 2)}</pre></details></div>}
            {approval.proposedNetworkPolicyAmendments != null && <div className="approval-field"><span>ネットワーク規則（候補）</span><pre>{JSON.stringify(approval.proposedNetworkPolicyAmendments, null, 2)}</pre></div>}
          </div>
        )}

        <details className="approval-scope"><summary>要求の識別情報</summary><dl><dt>スレッド</dt><dd title={approval.threadId}>{shortId(approval.threadId)}</dd><dt>ターン</dt><dd title={approval.turnId}>{shortId(approval.turnId)}</dd><dt>項目</dt><dd title={approval.itemId}>{shortId(approval.itemId)}</dd></dl></details>
      </div>

      <div className="approval-actions">
        {approval.kind === "toolUserInput" ? <>
          <button className="danger-ghost-button" onClick={() => onDecision("cancel")} title="回答せず確認要求を終了します。Codexのターン自体は中断しません。">回答せず閉じる</button>
          <button className="primary-button" disabled={approval.questions?.some((q) => q.required !== false && !answers[q.id]?.trim())} onClick={() => onDecision("accept", answers)}>回答を送信</button>
        </> : <>
        {approval.availableDecisions?.includes("cancel") && <button className="danger-ghost-button" onClick={() => onDecision("cancel")} title={approval.kind === "mcpToolApproval" ? "このツール確認を取り消します。ターン自体は中断しません。" : "拒否して現在のターンも中断します"}>中止</button>}
        {approval.availableDecisions?.includes("decline") && <button className="danger-ghost-button" onClick={() => onDecision("decline")} title="この操作だけを拒否し、ターンは継続します">拒否</button>}
        {hasAllowDecision && <div className="approval-allow-group">
          <select aria-label="承認範囲" value={allowDecision} onChange={(event) => setAllowDecision(event.target.value as ApprovalDecision)}>
            {approval.availableDecisions?.includes("accept") && <option value="accept">今回のみ許可</option>}
            {approval.availableDecisions?.includes("acceptForSession") && <option value="acceptForSession">このCodex接続中は許可</option>}
            {approval.availableDecisions?.includes("acceptWithExecPolicyAmendment") && <option value="acceptWithExecPolicyAmendment">提示されたコマンド規則を許可</option>}
          </select>
          <button className="primary-button" disabled={!allowApproval} title={allowApproval ? undefined : "中央エディターで差分を安全に復元できないため許可できません"} onClick={() => onDecision(allowDecision)}>許可</button>
        </div>}
        {hasAllowDecision && <small className="approval-scope-explanation">{approvalScopeExplanation(allowDecision)}</small>}
        </>}
      </div>
    </section>
  );
}

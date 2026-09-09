import { useEffect, useState } from "react";
import { approvalRequestKey, changeKindLabel, stripAnsi } from "../codexApproval";
import type { ApprovalDecision, ApprovalRequest } from "../types";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  queuedCount: number;
  fontSize: number;
  onDecision: (decision: ApprovalDecision) => void;
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
  useEffect(() => setSelectedPath(approval.changes[0]?.path ?? ""), [approval]);
  useEffect(() => setAllowDecision(approval.availableDecisions?.includes("accept") ? "accept" : approval.availableDecisions?.find((value) => value === "acceptForSession" || value === "acceptWithExecPolicyAmendment") ?? "accept"), [approval]);
  const selectedChange = approval.changes.find((change) => change.path === selectedPath) ?? approval.changes[0];
  const network = typeof approval.networkApprovalContext === "object" && approval.networkApprovalContext !== null
    ? approval.networkApprovalContext as Record<string, unknown>
    : null;
  const permissions = [
    ...permissionLines(approval.additionalPermissions, "追加権限"),
    ...permissionLines(approval.proposedExecpolicyAmendment, "実行ポリシー"),
    ...permissionLines(approval.proposedNetworkPolicyAmendments, "ネットワークポリシー"),
  ];
  const actions = actionLines(approval.commandActions);
  const hasAllowDecision = approval.availableDecisions?.some((value) => value === "accept" || value === "acceptForSession" || value === "acceptWithExecPolicyAmendment") ?? false;

  return (
    <section className="approval-card" aria-label="Codex承認要求" data-request-key={approvalRequestKey(approval)}>
      <div className="approval-heading">
        <span className="approval-icon">!</span>
        <div><strong>{approval.kind === "fileChange" ? "ファイル変更の承認" : network ? "ネットワーク利用の承認" : "コマンド実行の承認"}</strong><small>{queuedCount > 1 ? `残り ${queuedCount} 件` : "内容を確認してください"}</small></div>
      </div>

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
      ) : (
        <div className="command-approval-details">
          <div className="approval-field"><span>コマンド</span><code>{stripAnsi(approval.command || "コマンド詳細なし")}</code></div>
          <div className="approval-field"><span>作業ディレクトリ</span><code>{approval.cwd || approval.workspaceRoot || "不明"}</code></div>
          {!!actions.length && <div className="approval-field"><span>想定される操作</span><ul>{actions.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul></div>}
          {network && <div className="approval-field"><span>ネットワーク接続先</span><code>{String(network.protocol ?? "network")}://{String(network.host ?? "不明")}</code></div>}
          {!!permissions.length && <div className="approval-field"><span>要求される追加権限</span><ul>{permissions.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul></div>}
        </div>
      )}

      <details className="approval-scope"><summary>要求の識別情報</summary><dl><dt>スレッド</dt><dd title={approval.threadId}>{shortId(approval.threadId)}</dd><dt>ターン</dt><dd title={approval.turnId}>{shortId(approval.turnId)}</dd><dt>項目</dt><dd title={approval.itemId}>{shortId(approval.itemId)}</dd></dl></details>

      <div className="approval-actions">
        {approval.availableDecisions?.includes("cancel") && <button className="danger-ghost-button" onClick={() => onDecision("cancel")} title="拒否して現在のターンも中断します">中止</button>}
        {approval.availableDecisions?.includes("decline") && <button className="danger-ghost-button" onClick={() => onDecision("decline")} title="この操作だけを拒否し、ターンは継続します">拒否</button>}
        {hasAllowDecision && <div className="approval-allow-group">
          <select aria-label="承認範囲" value={allowDecision} onChange={(event) => setAllowDecision(event.target.value as ApprovalDecision)}>
            {approval.availableDecisions?.includes("accept") && <option value="accept">今回のみ許可</option>}
            {approval.availableDecisions?.includes("acceptForSession") && <option value="acceptForSession">このCodex接続中は許可</option>}
            {approval.availableDecisions?.includes("acceptWithExecPolicyAmendment") && <option value="acceptWithExecPolicyAmendment">提示されたコマンド規則を許可</option>}
          </select>
          <button className="primary-button" disabled={!allowApproval} title={allowApproval ? undefined : "中央エディターで差分を安全に復元できないため許可できません"} onClick={() => onDecision(allowDecision)}>許可</button>
        </div>}
      </div>
    </section>
  );
}

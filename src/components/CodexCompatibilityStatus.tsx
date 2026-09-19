import { useId, useState } from "react";
import type { CodexCompatibilityReport, CodexFeatureId, CodexSandboxCheckId, CodexSandboxProbeReport, PhitsAgentSetupStatus } from "../types";
import { Icon } from "./Icons";

const FEATURE_LABELS: Record<CodexFeatureId, string> = {
  chat: "会話",
  threads: "スレッド",
  fileEditing: "ファイル編集",
  approvals: "承認",
};

const SANDBOX_LABELS: Record<CodexSandboxCheckId, string> = {
  appServer: "App Server",
  windowsSandbox: "Sandbox",
  commandExecution: "コマンド実行",
  workspaceCreate: "直下への作成",
  existingFileWrite: "既存ファイルの変更",
  childDirectoryWrite: "子階層への作成",
  workspacePermissions: "アクセス規則",
};

const WORKSPACE_EDIT_CHECKS = new Set<CodexSandboxCheckId>([
  "workspaceCreate",
  "existingFileWrite",
  "childDirectoryWrite",
]);

function overallLabel(report: CodexCompatibilityReport) {
  if (report.state === "compatible") return "互換性確認済み";
  if (report.state === "limited") return "一部機能のみ利用可能";
  if (report.state === "checking") return "確認中";
  return "互換性を確認できません";
}

function featureLabel(state: CodexCompatibilityReport["features"][number]["state"]) {
  if (state === "available") return "利用可能";
  if (state === "limited") return "制限あり";
  return "利用不可";
}

function sandboxStateLabel(state: CodexSandboxProbeReport["checks"][number]["state"]) {
  if (state === "available") return "利用可能";
  if (state === "limited") return "要確認";
  return "利用不可";
}

function combinedSandboxState(checks: CodexSandboxProbeReport["checks"]) {
  if (checks.some((check) => check.state === "unavailable")) return "unavailable" as const;
  if (checks.some((check) => check.state === "limited")) return "limited" as const;
  return "available" as const;
}

function combinedState(
  report: CodexCompatibilityReport,
  sandbox: CodexSandboxProbeReport | null,
  setup: PhitsAgentSetupStatus | null,
) {
  if (report.state === "incompatible" || sandbox?.state === "unavailable") return "incompatible" as const;
  if (
    report.state === "checking" ||
    report.state === "limited" ||
    sandbox?.state === "limited" ||
    setup?.configured === false
  ) return "limited" as const;
  return "compatible" as const;
}

function combinedLabel(
  report: CodexCompatibilityReport,
  sandbox: CodexSandboxProbeReport | null,
  setup: PhitsAgentSetupStatus | null,
) {
  if (!sandbox) return overallLabel(report);
  const state = combinedState(report, sandbox, setup);
  if (state === "compatible") return "Codex編集環境：確認済み";
  if (state === "limited") return "Codex編集環境：要確認";
  return "Codex編集環境：書込み未確認";
}

export function CodexCompatibilityStatus({
  report,
  busy,
  sandbox = null,
  sandboxBusy = false,
  setup = null,
}: {
  report: CodexCompatibilityReport | null;
  busy: boolean;
  sandbox?: CodexSandboxProbeReport | null;
  sandboxBusy?: boolean;
  setup?: PhitsAgentSetupStatus | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  if (busy && !report) {
    return <section className="codex-compatibility" aria-label="Codex機能の互換性"><p className="codex-probe-summary">Codex機能を確認中…</p></section>;
  }
  if (!report) return null;
  const state = combinedState(report, sandbox, setup);
  const label = combinedLabel(report, sandbox, setup);
  const displayLabel = busy || sandboxBusy ? "Codex編集環境：確認中…" : label;
  const windowsSandboxCheck = sandbox?.checks.find((check) => check.id === "windowsSandbox");
  const commandExecutionCheck = sandbox?.checks.find((check) => check.id === "commandExecution");
  const workspacePermissionCheck = sandbox?.checks.find((check) => check.id === "workspacePermissions");
  const workspaceEditChecks = sandbox?.checks.filter((check) => WORKSPACE_EDIT_CHECKS.has(check.id)) ?? [];
  const workspaceEditState = combinedSandboxState(workspaceEditChecks);
  const workspaceEditDetail = workspaceEditChecks
    .map((check) => `${SANDBOX_LABELS[check.id]}: ${check.detail}`)
    .join("\n");
  const renderSandboxCheck = (check: CodexSandboxProbeReport["checks"][number]) => <div className="codex-feature-row" key={check.id} title={check.detail}>
    <span className={`diagnostic-dot ${check.state === "available" ? "ok" : check.state === "limited" ? "warn" : "bad"}`} />
    <span>{SANDBOX_LABELS[check.id]}</span>
    <small>{sandboxStateLabel(check.state)}</small>
  </div>;
  return <section className={`codex-compatibility ${state}`} aria-label="Codex機能の互換性と編集環境">
    <button
      type="button"
      className="codex-probe-summary"
      aria-expanded={expanded}
      aria-controls={detailsId}
      onClick={() => setExpanded((value) => !value)}
    >
      <span className={`diagnostic-dot ${state === "compatible" ? "ok" : state === "limited" ? "warn" : "bad"}`} />
      <strong>{displayLabel}</strong>
      <Icon name="chevron" className="codex-probe-chevron" />
    </button>
    {expanded && <div className="codex-feature-list" id={detailsId}>
      {report.features.map((feature) => <div className="codex-feature-row" key={feature.id} title={feature.detail}>
        <span className={`diagnostic-dot ${feature.state === "available" ? "ok" : feature.state === "limited" ? "warn" : "bad"}`} />
        <span>{FEATURE_LABELS[feature.id]}</span>
        <small>{featureLabel(feature.state)}</small>
      </div>)}
      {setup && <div className="codex-feature-row" title={setup.message}>
        <span className={`diagnostic-dot ${setup.configured ? "ok" : "warn"}`} />
        <span>PHITS参照設定</span>
        <small>{setup.configured ? "確認済み" : "要確認"}</small>
      </div>}
      {windowsSandboxCheck && renderSandboxCheck(windowsSandboxCheck)}
      {commandExecutionCheck && renderSandboxCheck(commandExecutionCheck)}
      {workspaceEditChecks.length > 0 && <div className="codex-feature-row" title={workspaceEditDetail}>
        <span className={`diagnostic-dot ${workspaceEditState === "available" ? "ok" : workspaceEditState === "limited" ? "warn" : "bad"}`} />
        <span>ワークスペース編集</span>
        <small>{sandboxStateLabel(workspaceEditState)}</small>
      </div>}
      {workspacePermissionCheck && renderSandboxCheck(workspacePermissionCheck)}
      {sandbox && <div className="codex-feature-row" title="Codexが現在使用するSandbox方式">
        <span className="diagnostic-dot" />
        <span>Sandbox方式</span>
        <small>{sandbox.implementation ?? "取得不可"}</small>
      </div>}
    </div>}
    {report.messages.slice(0, 1).map((message) => <p className="diagnostic-message" key={message}>{message}</p>)}
  </section>;
}

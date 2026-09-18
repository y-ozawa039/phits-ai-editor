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
  windowsSandbox: "Sandbox準備",
  commandExecution: "コマンド実行",
  workspaceCreate: "直下へ作成",
  existingFileWrite: "既存相当を変更",
  childDirectoryWrite: "子階層へ作成",
  workspacePermissions: "アクセス規則",
};

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
  const remainingSandboxChecks = sandbox?.checks.filter((check) => check.id !== "appServer" && check.id !== "windowsSandbox") ?? [];
  const renderSandboxCheck = (check: CodexSandboxProbeReport["checks"][number]) => <div className={`codex-feature-row${check.id === "windowsSandbox" ? " codex-feature-row-wide" : ""}`} key={check.id} title={check.detail}>
    <span className={`diagnostic-dot ${check.state === "available" ? "ok" : check.state === "limited" ? "warn" : "bad"}`} />
    <span>{SANDBOX_LABELS[check.id]}</span>
    <small>{check.state === "available" ? "利用可能" : check.state === "limited" ? "要確認" : "利用不可"}</small>
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
      {setup && windowsSandboxCheck && <span className="codex-feature-spacer" aria-hidden="true" />}
      {windowsSandboxCheck && renderSandboxCheck(windowsSandboxCheck)}
      {remainingSandboxChecks.map(renderSandboxCheck)}
      {sandbox && <div className="codex-feature-row codex-feature-row-wide" title="Codexが現在使用するSandbox方式">
        <span className="diagnostic-dot" />
        <span>Sandbox方式</span>
        <small>{sandbox.implementation ?? "取得不可"}</small>
      </div>}
      {sandbox?.allowedImplementations.length ? <div className="codex-feature-row codex-feature-row-wide" title="組織ポリシーで許可されたSandbox方式">
        <span className="diagnostic-dot" />
        <span>許可方式</span>
        <small>{sandbox.allowedImplementations.join(", ")}</small>
      </div> : null}
    </div>}
    {report.messages.slice(0, 1).map((message) => <p className="diagnostic-message" key={message}>{message}</p>)}
  </section>;
}

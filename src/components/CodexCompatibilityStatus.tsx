import type { CodexCompatibilityReport, CodexFeatureId } from "../types";

const FEATURE_LABELS: Record<CodexFeatureId, string> = {
  chat: "会話",
  threads: "スレッド",
  fileEditing: "ファイル編集",
  approvals: "承認",
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

export function CodexCompatibilityStatus({ report, busy }: { report: CodexCompatibilityReport | null; busy: boolean }) {
  if (busy && !report) {
    return <section className="codex-compatibility" aria-label="Codex機能の互換性"><p className="codex-probe-summary">Codex機能を確認中…</p></section>;
  }
  if (!report) return null;
  return <section className={`codex-compatibility ${report.state}`} aria-label="Codex機能の互換性">
    <div className="codex-probe-summary"><strong>{overallLabel(report)}</strong>{busy && <span>再確認中…</span>}</div>
    <div className="codex-feature-list">
      {report.features.map((feature) => <div className="codex-feature-row" key={feature.id} title={feature.detail}>
        <span className={`diagnostic-dot ${feature.state === "available" ? "ok" : feature.state === "limited" ? "warn" : "bad"}`} />
        <span>{FEATURE_LABELS[feature.id]}</span>
        <small>{featureLabel(feature.state)}</small>
      </div>)}
    </div>
    {report.messages.slice(0, 1).map((message) => <p className="diagnostic-message" key={message}>{message}</p>)}
  </section>;
}

import type { CodexCompatibilityReport, CodexEditingAccessState, CodexLiveEditProbeReport, CodexSandboxProbeReport, PhitsAgentSetupStatus, RuntimeDiagnostics, WorkspaceEnvironmentReport } from "./types";

export interface DiagnosticReportInput {
  appVersion: string;
  workspaceRoot: string;
  runtime: RuntimeDiagnostics | null;
  compatibility: CodexCompatibilityReport | null;
  agentSetup: PhitsAgentSetupStatus | null;
  sandbox: CodexSandboxProbeReport | null;
  liveEditProbe?: CodexLiveEditProbeReport | null;
  editingAccess?: CodexEditingAccessState;
  workspaceEnvironment: WorkspaceEnvironmentReport | null;
  connectionCategory?: string | null;
  connectionError?: string | null;
}

const line = (value: string | null | undefined) => value || "未取得";

export function buildDiagnosticReport(input: DiagnosticReportInput): string {
  const output = [
    "PHITS AI Editor 診断レポート",
    `生成日時: ${new Date().toISOString()}`,
    `エディタ版: ${input.appVersion}`,
    `ワークスペース: ${input.workspaceRoot}`,
    "",
    "[実行環境]",
    `PHITSルート: ${line(input.runtime?.phitsRoot)}`,
    `PHITS版: ${line(input.runtime?.phitsVersion)}`,
    `PHITS互換性: ${line(input.runtime?.compatibility)}`,
    `Codex CLI: ${line(input.runtime?.codexPath)}`,
    `Codex CLI版: ${line(input.runtime?.codexVersion)}`,
    `起動ログ: ${line(input.runtime?.startupLog)}`,
    ...(input.runtime?.messages.map((message) => `- ${message}`) ?? []),
    "",
    "[ワークスペース保存場所]",
  ];
  const environment = input.workspaceEnvironment;
  if (environment) {
    output.push(
      `状態: ${environment.state}`,
      `ドライブ種別: ${environment.driveKind}`,
      `ファイルシステム: ${line(environment.fileSystem)}`,
      `UNC: ${environment.isUnc ? "はい" : "いいえ"}`,
      `特殊フォルダー: ${environment.isReparsePoint ? "はい" : "いいえ"}`,
      `読み取り専用属性: ${environment.readOnly ? "あり" : "なし"}`,
      `パス長: ${environment.pathLength}`,
      `同期サービス: ${line(environment.syncProvider)}`,
      ...environment.messages.map((message) => `- ${message}`),
    );
  } else output.push("未検査");
  output.push("", "[Codex App Server互換性]");
  if (input.compatibility) {
    output.push(
      `状態: ${input.compatibility.state}`,
      ...input.compatibility.features.map((feature) => `- ${feature.id}: ${feature.state} (${feature.detail})`),
      ...input.compatibility.messages.map((message) => `- ${message}`),
    );
  } else output.push("未検査");
  output.push("", "[PHITS用Codex設定]");
  if (input.agentSetup) {
    output.push(
      `状態: ${input.agentSetup.state}`,
      ...input.agentSetup.checks.map((check) => `- ${check.id}: ${check.state} (${check.message})${check.path ? `\n  検査パス: ${check.path}` : ""}`),
    );
  } else output.push("未検査");
  output.push("", "[Codex編集環境]");
  if (input.sandbox) {
    output.push(
      `状態: ${input.sandbox.state}`,
      `Sandbox方式: ${line(input.sandbox.implementation)}`,
      ...input.sandbox.checks.map((check) => `- ${check.id}: ${check.state} (${check.detail})`),
      ...input.sandbox.messages.map((message) => `- ${message}`),
    );
  } else output.push("未検査（Codex接続時または手動再診断時に実行）");
  output.push("", "[任意のCodex実編集検査]");
  if (input.liveEditProbe) {
    output.push(
      `状態: ${input.liveEditProbe.state}`,
      `経路: ${input.liveEditProbe.route}`,
      `モデル: ${line(input.liveEditProbe.model)}`,
      `思考: ${line(input.liveEditProbe.reasoningEffort)}`,
      `検査用ファイルの後片付け: ${input.liveEditProbe.cleanupSucceeded ? "完了" : "未完了"}`,
      `診断スレッドの後片付け: ${input.liveEditProbe.threadCleanupSucceeded ? "完了" : "未完了"}`,
      input.liveEditProbe.detail,
    );
  } else output.push("未実行");
  output.push(
    "",
    "[エディタ側の編集制限]",
    input.editingAccess === "liveProbe"
      ? "実際のCodex編集経路を確認済み（現在の接続中のみ）"
      : input.editingAccess === "userOverride"
        ? "利用者の選択で解除（現在のワークスペースと接続中のみ）"
        : "自動診断結果に従う",
  );
  if (input.connectionError) {
    output.push("", "[Codex接続失敗]", `分類: ${line(input.connectionCategory)}`, input.connectionError);
  }
  output.push("", "注意: このレポートは保存時点の検査結果です。次回の利用可否判定には再利用されません。");
  return `${output.join("\n")}\n`;
}

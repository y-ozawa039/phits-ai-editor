import packageMetadata from "../package.json";
import type { CodexCompatibilityReport, PhitsAgentSetupStatus, RuntimeDiagnostics } from "./types";

interface PhitsAgentSetupHelpInput {
  workspaceRoot: string;
  setup: PhitsAgentSetupStatus | null;
  diagnostics: RuntimeDiagnostics | null;
  compatibility: CodexCompatibilityReport | null;
  connectionError: string | null;
}

const setupStateLabels = {
  confirmed: "確認済み",
  partial: "部分確認",
  mismatch: "不一致",
  missing: "未設定",
  unreadable: "読取不能",
} as const;

const checkLabels = {
  resource: "PHITS AI設定資源",
  phitsRoot: "PHITSルートの指示",
  codexGlobal: "Codexグローバル指示",
  workspace: "ワークスペース指示",
  rootConsistency: "PHITSルートの整合性",
} as const;

const pathSourceLabels = {
  workspaceSetting: "ワークスペース設定",
  appSetting: "アプリ設定",
  environment: "環境変数 PHITSPATH",
  standardLocation: "標準位置から自動検出",
  unavailable: "未検出",
} as const;

export function buildPhitsAgentSetupHelp(input: PhitsAgentSetupHelpInput): string {
  const setupLines = input.setup?.checks.map((check) => [
    `- ${checkLabels[check.id]}: ${setupStateLabels[check.state]}`,
    `  理由: ${check.message}`,
    ...(check.path ? [`  検査パス: ${check.path}`] : []),
  ].join("\n")) ?? ["- PHITS用Codex設定: 検査結果を取得できませんでした。"];
  const featureLines = input.compatibility?.features.map((feature) =>
    `- ${feature.id}: ${feature.state} (${feature.detail})`,
  ) ?? ["- App Server互換性: 検査結果なし"];
  const connectionSection = input.connectionError
    ? [
        "Editor内のCodexへ接続できなかったため、ChatGPTデスクトップ版のローカルCodexタスクから調査しています。",
        `接続エラー: ${input.connectionError}`,
      ]
    : ["Editor内のCodexには接続できますが、PHITS用設定の診断結果について調査を依頼します。"];

  return [
    `PHITS AI Editor ${packageMetadata.version}から、PHITS用Codex設定と接続環境の診断を依頼します。`,
    ...connectionSection,
    "",
    "環境:",
    `- ワークスペース: ${input.workspaceRoot}`,
    `- 解決したPHITSルート: ${input.diagnostics?.phitsRoot ?? "未検出"}`,
    `- PHITSルートの検出元: ${input.diagnostics ? pathSourceLabels[input.diagnostics.phitsPathSource] : "検査結果なし"}`,
    `- PHITSバージョン: ${input.diagnostics?.phitsVersion ?? "不明"}`,
    `- Codex CLI: ${input.diagnostics?.codexPath ?? "未検出"}`,
    `- Codex CLIバージョン: ${input.diagnostics?.codexVersion ?? "不明"}`,
    `- PHITS用設定の総合状態: ${input.setup ? setupStateLabels[input.setup.state] : "検査結果なし"}`,
    "",
    "PHITS用Codex設定の静的検査:",
    ...setupLines,
    "",
    "Codex App Server互換性:",
    ...featureLines,
    "",
    "依頼:",
    "1. 上記結果から考えられる原因を、確定事項と推測に分けて説明してください。",
    "2. アクセスできる場合は、解決したPHITSルートにある workbench/README-jp.docx と workbench/execution_setup_for_agent.md を読み、公式手順を優先してください。",
    "3. AGENTS.override.md が空でない場合は、同じディレクトリの AGENTS.md より優先されるものとして確認してください。",
    "4. 別バージョンのPHITSを参照していないか確認し、PHITSの場所を固定値として決めつけないでください。",
    "5. ファイルを変更する前に、バックアップ方法、変更対象、変更差分、元に戻す方法を提示し、私の確認を求めてください。既存の指示を削除または全面上書きしないでください。",
    "6. 認証情報、研究データ、PHITS入力・出力の内容は収集しないでください。PHITS計算も実行しないでください。",
    "",
    "注意: この結果は設定ファイルの静的検査であり、Codex App Serverが指示を実際に読み込んだことの証明ではありません。ローカルファイルを確認できないCloudタスクではなく、このPCへアクセスできるローカルCodexタスクとして調査してください。",
  ].join("\n");
}

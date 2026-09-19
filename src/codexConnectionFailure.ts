import type { CodexCompatibilityReport } from "./types";

export type CodexConnectionFailureCategory = "cliMissing" | "cliStart" | "authentication" | "network" | "compatibility" | "appServer" | "unknown";

export interface CodexConnectionIssue {
  category: CodexConnectionFailureCategory;
  message: string;
}

export function classifyCodexConnectionFailure(
  error: string,
  compatibility: CodexCompatibilityReport | null,
): CodexConnectionIssue {
  const normalized = error.toLocaleLowerCase();
  if (!compatibility?.codexPath) {
    return { category: "cliMissing", message: "Codex CLIを検出できません。Codex DesktopまたはCodex CLIの導入状態を確認してください。" };
  }
  if (/authentication|unauthorized|not logged in|\b401\b|token|認証|ログイン/.test(normalized)) {
    return { category: "authentication", message: `Codexの認証を確認してください。Codex DesktopまたはCodex CLIで再ログインした後、接続をやり直してください。詳細: ${error}` };
  }
  if (/proxy|certificate|tls|dns|network|firewall|接続|ネットワーク|証明書/.test(normalized)) {
    return { category: "network", message: `Codex App Serverとの通信を開始できません。組織のプロキシ、ファイアウォール、TLS検査、ネットワーク接続を確認してください。詳細: ${error}` };
  }
  if (/failed to start|cannot find|not found|見つかりません|起動できません/.test(normalized)) {
    return { category: "cliStart", message: `Codex CLIを起動できません。表示された実行ファイルの場所とセキュリティソフトの履歴を確認してください。詳細: ${error}` };
  }
  if (compatibility.state === "incompatible" || /schema|互換/.test(normalized)) {
    return { category: "compatibility", message: `Codex App Serverの互換性を確認できません。Codex CLIの版と機能別診断を確認してください。詳細: ${error}` };
  }
  if (/app server|initialize|json-?rpc|stream|stdin|stdout/.test(normalized)) {
    return { category: "appServer", message: `Codex CLIは見つかりましたが、App Serverの初期化を完了できませんでした。Codex CLIを単独で起動できるか確認してください。詳細: ${error}` };
  }
  return { category: "unknown", message: `Codex接続のどの段階で失敗したかを特定できませんでした。診断レポートと起動ログを確認してください。詳細: ${error}` };
}

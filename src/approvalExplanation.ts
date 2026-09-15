import { stripAnsi } from "./codexApproval";
import type { ApprovalRequest } from "./types";

const generic = "この操作には定型の補足説明を用意していません。下のコマンドとCodexからの要求理由をご確認ください。";

// Deliberately narrow recognizer: no claim about compound commands, scripts or arbitrary flags.
export function approvalExplanation(approval: ApprovalRequest): string {
  if (approval.kind === "fileChange") return "ファイルの内容を変更する要求です。対象ファイルと差分を確認してから許可してください。";
  if (approval.kind === "phitsRun") return "現在選択している保存済み入力を、エディタ経由でPHITSの通常実行に渡します。計算結果・ログなどの出力ファイルが作成・上書きされます。";
  if (approval.kind === "toolUserInput") return "Codexまたはツールからの確認・入力要求です。選択肢や質問は要求元の内容をそのまま表示しています。回答してもエディタのPHITS実行条件や権限制限は解除されません。";
  if (approval.kind === "mcpToolApproval") return "MCPツールの利用を求める確認です。対象サーバー、要求内容、引数を確認してください。エディタ専用PHITSツールは、この確認の後も入力・保存状態・承認モードなどの実行条件を検査します。";
  if (approval.networkApprovalContext) return "外部へのネットワーク接続を求める要求です。接続先と要求理由をご確認ください。";
  const rawCommand = stripAnsi(approval.command ?? "").trim();
  // App Server often wraps even a read operation in PowerShell. Recognize only
  // the explicit -Command envelope, not encoded commands, extra flags or scripts.
  const envelope = /^(?:"[^"$`]*[\\/](?:pwsh|powershell)\.exe"|(?:pwsh|powershell)(?:\.exe)?)\s+(?:(?:-NoProfile|-NonInteractive)\s+)*-Command\s+"([^"`$]*)"$/i.exec(rawCommand);
  const command = envelope?.[1].trim() ?? rawCommand;
  const readExplanation = (text: string) => envelope ? `${text}提示されたコマンド全体と要求理由もご確認ください。` : `${text}このコマンド自体はファイルを書き換えません。`;
  if (/[;&|\r\n]/.test(command)) return "複数の操作をまとめて実行する要求です。処理内容については、下のコマンド全体とCodexからの要求理由をご確認ください。";
  if (/\.ps1\b|\b(?:-File|python|node|cmd)\b/i.test(command)) return "スクリプトを実行する操作です。具体的な処理内容については、下のコマンドとCodexからの要求理由をご確認ください。";
  // Only literal paths, with no PowerShell expansion, expression, redirection or wildcard flags.
  const literal = '(?:"[^"$`]*"|\'[^\']*\'|[^\\s"\'$`()<>{}]+)';
  if (new RegExp(`^Get-Content\\s+-LiteralPath\\s+${literal}(?:\\s+-Raw)?$`, "i").test(command)) return readExplanation("指定したファイルの内容を読み取る操作です。");
  if (new RegExp(`^Get-ChildItem(?:\\s+-LiteralPath\\s+${literal})?$`, "i").test(command)) return readExplanation("フォルダー内のファイル・フォルダー一覧を確認する操作です。");
  if (new RegExp(`^rg\\s+-n\\s+${literal}\\s+${literal}$`, "i").test(command) && !/[<>]|(?:^|\s)["']?-/.test(command.replace(/^rg\s+-n\s+/, ""))) return readExplanation("指定したファイル・フォルダーから一致する文字列と行番号を検索する操作です。");
  return generic;
}

export function approvalScopeExplanation(decision: string): string {
  if (decision === "acceptForSession") return "同じ承認範囲を、このCodex接続が終了するまで許可します。";
  if (decision === "acceptWithExecPolicyAmendment") return "提示されたコマンドの先頭部分に一致する今後の要求にも使われる規則を許可します。今回だけの許可とは異なります。";
  return "今回の要求だけを許可します。今後の要求を自動許可する規則は追加しません。";
}

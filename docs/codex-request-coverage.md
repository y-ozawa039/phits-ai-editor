# Codex確認要求の対応範囲

日本語 | [English](codex-request-coverage.en.md)

この表はCLI 0.153.1の固定Schemaと、開発端末のCLI 0.153.4で確認した
`ServerRequest`全10種類を対象とします。クライアントから送る要求や通知の一覧ではありません。
すべてのCodex機能への対応を保証するものではありません。

## 要求名の分類

| 要求 | 分類 | 動作・理由 |
| --- | --- | --- |
| `item/commandExecution/requestApproval` | 対応済み | 既存の承認キューとコマンド検査。ネットワーク・ワークスペース外書込み等は引き続き制限。 |
| `item/fileChange/requestApproval` | 対応済み | パス・リビジョン・承認モードを検査し、変更案を表示。 |
| `item/tool/requestUserInput` | 対応済み | 元の質問と選択肢を表示し、明示的な回答を送信。回答せず閉じることも可能。 |
| `mcpServer/elicitation/request` | 対応済み（形式限定） | 基本的な入力フォームと空の確認フォーム。形式別分類は下記。 |
| `item/permissions/requestApproval` | 意図的に制限 | 空の追加権限と`turn`スコープを返す。ユーザー拒否ではなくエディタの権限制限として記録。 |
| `item/tool/call` | 利用対象外 | 動的ツールを登録しない。PHITSはエディタ所有のMCP経路を使う。 |
| `account/chatgptAuthTokens/refresh` | 利用対象外 | エディタは外部管理のChatGPTトークンを供給しない。CLI側の通常認証を使う。 |
| `attestation/generate` | 利用対象外 | `requestAttestation`にオプトインしない。 |
| `applyPatchApproval` | 利用対象外 | 旧式プロトコル。エディタはv2のthread/turn APIを使用。 |
| `execCommandApproval` | 利用対象外 | 旧式プロトコル。エディタはv2のthread/turn APIを使用。 |

`tool/requestUserInput`も互換用の別名として対応していますが、上記の生成Schema全10種類には
含まれません。新しい未分類要求は「未対応」として扱い、自動許可しません。
利用対象外でも実際に要求が届いた場合は未対応ログを残します。

## 形式・項目ごとの分類

| 形式・項目 | 分類 | 動作・理由 |
| --- | --- | --- |
| MCP `form`：空の確認 | 対応済み | 許可・拒否・中止。同じターンの専用`run_phits`項目・引数と一致する入口だけを実行審査へ転送。PHITS実行の許可は別途検査。 |
| MCP `form`：文字列・文字列選択肢・真偽値・数値・整数 | 対応済み | 必須項目、数値範囲、文字数をRust側で検査。任意の空欄は送信しない。 |
| MCP `url` | 意図的に制限 | 外部URLを自動で開かず、未対応形式の理由を表示。 |
| MCP `openai/form` | 利用対象外 | 拡張フォームの受信能力にオプトインしない。届いた場合も自動許可しない。 |
| 配列・入れ子object・未対応のSchema制約 | 未対応 | 制約を無視せず、理由を記録して停止。 |
| ツール質問の`autoResolutionMs` | 意図的に制限 | 時間経過で回答を自動選択・送信しない。 |

フォームは最大20項目、各回答は最大16,384バイトです。回答は自動選択しません。
無効な回答の送信はRust側で拒否し、修正できるよう要求を保留します。
質問本文・回答・認証情報は未対応診断ログへ記録しません。

## 自動検査と限界

分類の機械可読な定義は`scripts/codex-request-coverage.mjs`です。
Schema検査は全要求を照合し、新規要求、必要な要求の欠落、参照するパラメーターの欠落、
未知のSchema構造を検出すると失敗します。任意項目のすべての型・意味の変更を検出するものではありません。
基本フォーム制約の判断はRustの実装で行い、実行時も未知の形式を拒否します。

```powershell
pnpm test:codex-request-coverage
pnpm test:codex-schema
```

実CLIとloopbackの模擬モデル・MCPによる試験は、空のMCP確認、入力付きフォーム、
コマンド承認の許可・拒否・中止、および追加権限を付与しない応答を検査します。
実アカウント、実PHITS計算、グローバル設定は使いません。
UIとRust境界の試験は別途実行します。模擬クライアントの試験だけでエディタexeの動作を
保証しないため、Windows CIのRust試験と実機確認も必要です。

[ビルド・試験方法](building.md) | [安全境界](safety-boundaries.md)

要求形式の参考：[OpenAI公式App Server仕様](https://learn.chatgpt.com/docs/app-server)

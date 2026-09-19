# PHITS AI Editorのビルド

日本語 | [English](building.en.md)

## 対応する開発環境

最初のバイナリ配布対象はWindows 11 x64です。CIではUbuntuでもsourceをcompile・test
しますが、公式Linux binaryはまだ公開しません。

必要なもの：

- Node.js 24
- pnpm 11.19.0
- 現行のRust stable toolchain
- WindowsではMicrosoft C++ Build ToolsとTauri用WebView2要件

compileにはPHITSとCodex CLIは必須ではありません。それぞれの連携試験を行う場合だけ、
各提供条件に従って別途インストールしてください。

## 開発環境の準備

```powershell
git clone https://github.com/y-ozawa039/phits-ai-editor.git
Set-Location phits-ai-editor
pnpm install --frozen-lockfile
pnpm tauri:dev
```

現在のshellでCargoが`PATH`にない場合：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

## 検査

```powershell
pnpm test
pnpm docs:check
pnpm test:licenses
pnpm licenses:generate
pnpm licenses:audit
pnpm test:codex-schema
pnpm test:codex-request-coverage
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

任意の実App Server編集smoke testは、使い捨ての`.integration`ワークスペースだけへ
書き込みます。

```powershell
node scripts/app-server-edit-smoke.mjs (Get-Command codex).Source .integration
```

このsmoke testを研究データに対して実行しないでください。

承認経路は、利用者の認証を使わない実App Server＋ローカル模擬AI・MCPで検査できます。
ネイティブの`codex.exe`（Windows）またはCodex実行バイナリーを指定してください。

```powershell
node scripts/app-server-approval-smoke.mjs C:\path\to\codex.exe
```

空のMCP確認、文字列・選択肢・真偽値・整数・数値を含む入力フォーム、コマンド実行の
許可・拒否・取消、およびネットワーク・ファイル・両方の追加権限を付与しない応答の
計12ケースで、要求解決通知と結果返却も検査します。追加権限ツールの実験機能は一時環境だけで
有効にします。一時Codex homeを生成してプラグイン同期・更新確認を無効にし、終了時に
一時環境だけを削除します。コマンドは固定文字列の表示だけで、PHITSは実行しません。
これは実CLIのプロトコル試験であり、エディタのUI試験・Rust境界試験・実環境での
PHITS実行確認とは別です。最新版CLIの定期GitHub Actionsでも同じ試験を実行します。

全要求名の分類と未対応形式の詳細は[Codex確認要求の対応範囲](codex-request-coverage.md)を
参照してください。未分類の要求が新たに追加された場合はSchema検査を失敗させます。

## PHITS用Codex設定表示の手動確認

開発端末の実設定を変更せず、5種類の静的検査結果をデバッグ版で順番に確認できます。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview-agent-setup-states.ps1
```

各画面でCodexへ接続し、表示を確認してEditorを閉じると次のケースが起動します。
スクリプトは一時ワークスペースと検査専用Codex homeだけを生成します。実際のCodex
App Serverは通常の認証済み環境を使用し、検査専用homeを参照する処理はdebug buildに
だけ含まれます。`-Case Partial`で1状態だけ、`-PrepareOnly -KeepFixtures`で起動せずに
fixtureだけを生成できます。

## Codex編集環境診断の手動確認

実際の研究フォルダーを変更せず、Sandbox診断を5種類の一時ワークスペースで順番に
確認できます。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview-sandbox-diagnostics.ps1 -Executable C:\path\to\phits-ai-editor.exe
```

| ケース | 確認内容 |
|---|---|
| `HealthyExisting` | ファイルと子フォルダーが存在する通常のワークスペース |
| `ProtectedInheritance` | ACL継承は停止しているが、実際の書込みは可能なワークスペース |
| `OwnerOnly` | 現在の利用者だけに限定したACL。`elevated`ではフォルダー固有問題を再現できる可能性があり、`unelevated`では利用可能になる場合があります |
| `ExplicitWriteDeny` | 明示的な書込み拒否があり、ワークスペース権限として分類されるケース |
| `UnicodePath` | 空白と日本語を含むパス |

各画面でCodexへ接続し、実行環境の更新を1回行って詳細を確認してください。Editorを
閉じると次のケースが起動します。`-Case OwnerOnly`のように1ケースだけ指定できます。
`-ValidateFixturesOnly`はEditorを起動せず、fixtureのACLとパスを検査します。

スクリプトは`.integration/sandbox-diagnostic-preview`の下へランダムな専用フォルダーを
作成します。終了時は変更したACLを親からの継承状態へ戻し、安全マーカーと絶対パスを
確認してから、その専用フォルダーだけを削除します。PHITSは実行せず、研究データ、
Codex設定、実ワークスペースのACLは変更しません。

## リリースビルド

```powershell
pnpm tauri build --bundles nsis
```

未梱包の実行ファイルは`src-tauri/target/release/`、NSISインストーラーは
`src-tauri/target/release/bundle/nsis/`へ出力されます。両方ともGitの追跡対象外です。
ローカルビルドは、リリース検査を通過して対応するGit tagへ添付されるまで公式
リリースではありません。

ビルド成功後、ポータブルarchive、正規化したinstaller名、CycloneDX SBOM、SHA-256
一覧を作成します。

```powershell
pnpm release:package:windows
```

draftは`src-tauri/target/release/release-candidate/v0.0.7-alpha/`以下へ出力され、
Gitの追跡対象外です。

## PHITSの検出

実行時には、保存済みのアプリ設定、ワークスペース設定、`PHITSPATH`、標準
インストール場所の順に利用できます。設定UIはOSの`PATH`や`PHITSPATH`を変更しません。

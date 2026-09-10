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

draftは`src-tauri/target/release/release-candidate/v0.0.1-alpha/`以下へ出力され、
Gitの追跡対象外です。

## PHITSの検出

実行時には、保存済みのアプリ設定、ワークスペース設定、`PHITSPATH`、標準
インストール場所の順に利用できます。設定UIはOSの`PATH`や`PHITSPATH`を変更しません。

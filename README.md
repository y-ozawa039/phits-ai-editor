# PHITS AI Editor

日本語 | [English](README.en.md)

PHITS-Pad相当の編集・実行機能と、Codex App ServerによるAI支援を統合するTauriデスクトップアプリです。

## Windows版をダウンロード

初回alpha版はWindows 11 x64専用です。

- **通常利用（推奨）:**
  [インストーラー版をダウンロード](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.1-alpha/PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe)
- **試用・持ち運び・複数版の比較:**
  [ポータブル版をダウンロード](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.1-alpha/PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip)
- **ダウンロード後の確認:**
  [SHA-256一覧](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.1-alpha/SHA256SUMS.txt)

| 目的 | 選ぶファイル | 選択理由 |
|---|---|---|
| 日常的にPHITS入力を編集する | インストーラー版 | スタートメニュー、アンインストーラー、`.inp`／`.pht`の関連付けが登録されます。Explorerから入力ファイルを直接開く使い方に適しています。 |
| まず試してみる | ポータブル版 | インストールせず、ZIP全体を任意のフォルダーへ展開して`phits-ai-editor.exe`を起動できます。 |
| 複数バージョンを比較する、USBメモリ等で持ち運ぶ | ポータブル版 | バージョンごとに別フォルダーへ展開でき、Windowsへのアプリ登録を増やさずに使えます。 |
| ソースを生成AI等で改造・開発する | Source code | 開発用です。そのままでは起動できず、Node.js、pnpm、Rust等を用いたビルドが必要です。 |

> **注意:** GitHubが自動表示する`Source code (zip)`と`Source code (tar.gz)`は、
> ポータブル実行版ではありません。展開後に`index.html`が見えるZIPはソースコードです。
> エディタを起動する場合は、上記のインストーラー版またはポータブル版を選んでください。

導入、初期設定、更新、アンインストール、SmartScreen、SHA-256確認の詳細は
[利用者向けインストールガイド](docs/installation.md)を参照してください。

PHITS本体とCodex CLIは同梱されません。PHITSは編集だけなら未設定でも起動でき、
Codex CLIはAI支援を使う場合だけ必要です。

## AI支援を使う前の準備

CodexからPHITSのローカルマニュアルと注意事項を参照できるようにするため、
初回利用前にPHITS公式の`<PHITSPATH>\workbench\README-jp.docx`を確認し、
Codex CLIへ次のように依頼してください。

> PHITSを実行する環境を整えてください。環境変数PHITSPATHが指すフォルダーの
> workbench/execution_setup_for_agent.mdを読み、その内容に従ってください。

セットアップが完了し、`Setup AI agent environment to PHITS is successfully finished.`
と表示されたことを確認してから、PHITS AI EditorでCodexへ接続してください。
この処理はCodexの`AGENTS.md`へPHITS参照ポリシーの入口を登録します。
Editorは初回接続時にこの設定を検査し、見つからない場合はCodexパネルに
公式セットアップの案内を表示します。

## 開発環境

- Windows 11 x64（`0.0.1-alpha`の公式バイナリ対象）
- Node.js 24 / pnpm 11
- Rust stable / MSVC
- PHITS 3.37（`PHITSPATH`から自動検出、または「設定 → PHITS実行環境」で指定）
- Codex CLI 0.153.1以降（AI機能を使う場合）

```powershell
pnpm install
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm tauri:dev
```

PHITS本体、Codex CLI、認証情報、PHITS言語資産はアプリへ同梱しません。

詳細は [MVP仕様](docs/mvp-specification.md)、[構成](ARCHITECTURE.md)、
[ビルド手順](docs/building.md)、[生成AIを使ったカスタマイズ](docs/customizing-with-ai.md)、
[安全境界](docs/safety-boundaries.md)を参照してください。アプリを利用する方は、まず
[インストールと初期設定](docs/installation.md)を確認してください。

## ライセンスと引用

PHITS AI Editorは[Apache License 2.0](LICENSE)で公開します。著作権者と
研究者識別情報は[AUTHORS.md](AUTHORS.md)、ソフトウェアを研究成果として
引用するための機械可読な情報は[CITATION.cff](CITATION.cff)を参照してください。
第三者依存関係の一覧は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、
配布対象のライセンス・著作権・NOTICE本文は
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)です。
名称・自作ロゴ・改変版の表示方針は[TRADEMARKS.md](TRADEMARKS.md)、脆弱性の
非公開報告方法は[SECURITY.md](SECURITY.md)を参照してください。

一般利用者向け文書は日本語版と英語版を用意し、各文書上部から切り替えられます。
`LICENSE`、`NOTICE`、第三者ライセンス本文、自動生成一覧、`CITATION.cff`などの
法的原文・機械可読ファイルは、意味や効力を変えないため翻訳対象外です。
MVP設計書、公開監査記録、リリース担当者手順、試験証跡などの内部保守文書も、
一般利用者向け文書とは区別し、作成時の言語を正本とします。

引用は通常利用の条件ではありません。PHITS AI Editorが公開研究へ実質的に
貢献した場合に限り、謝辞への記載または`CITATION.cff`を用いた任意の引用を
歓迎します。

本プロジェクトは個人による独立した開発であり、著者の所属機関による開発、
承認または保証を意味しません。PHITS本体とCodex CLIは別製品であり、この
リポジトリおよび配布物には含まれません。利用者はそれぞれを正規の提供元から
入手し、各利用条件に従ってください。

本プロジェクトは、生成AIなどを使って自分の用途へ改造できる基盤として公開する
個人開発のalpha版です。問題発生時にログやソースコードを調べ、自力で調査・回避・
復旧を進められる方を主な対象としており、個別サポートや回答期限は保証しません。
IssueおよびPull Requestの方針は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

`PHITS AI Editor`と緑色のPロゴはalpha版の暫定名称・ロゴです。本プロジェクトは
JAEA、PHITS開発チーム、OpenAIまたは著者の所属機関による開発・承認・後援・
保証を受けた公式製品ではありません。

## Windows alpha版（0.0.1-alpha）

実装済みの主な機能:

- Monacoによる複数タブ編集、検索・置換、Undo/Redo、新規作成、保存、名前を付けて保存
- Explorerの「プログラムから開く」や実行ファイルへのドラッグ＆ドロップで`.inp`/`.pht`を直接開き、親フォルダーをワークスペース、対象ファイルを実行対象として自動選択。二重起動は既存ウィンドウへ転送し、通常起動では前回のワークスペースと保存済みタブを復元
- 表示メニューのチェック状態と同期したエクスプローラー／Codex／出力パネル切替、およびエクスプローラー・エディター・Codexの個別文字サイズ設定（12～28px、工場出荷時14px、直接入力／候補一覧／A↑・A↓、アプリ全体のユーザー既定値を保存可能）。縮小側のAは拡大側より小さく表示する。アプリケーションの背景と外枠はニュートラルなグレー系とし、PHITS構文強調や正常・警告・異常を示す意味色は維持する。上部メニュー、ツールバー、タブ、ファイル一覧など主要操作部の文字は`#000000`、行番号はグレー、PロゴとCodexの主要操作は青系アクセントで表示する
- UTF-8／BOM付きUTF-8／Windows-31JおよびCRLF／LFの保持、原子的保存、1世代バックアップ
- 外部`phits-spec.json`による構文強調、補完、日英ホバー
- 公式ラッパーを使う通常実行と、Editor/Codexを残さない本番実行（計算優先）
- ANGEL、DCHAIN、PHIG-3Dの固定公式経路からの起動
- Codex App Server 0.153.1を最低基準とする遅延起動、起動時Schema互換性プローブ、会話・スレッド・ファイル編集・承認の機能別可否表示と安全な縮退、タイトル付きスレッドの再開・名前変更・恒久削除、モデル選択、Markdown会話表示、安全なHTTP/HTTPSリンク
- 現在のファイル・選択・未保存状態を128 KiB上限で渡すEditor Context、3つの承認モード、セッション許可、中央Monacoの全文差分レビュー（インライン／左右比較、変更箇所移動、変更後の「変更を保持／元に戻す」）、ターン単位チェックポイント、Codex変更後の再読込と競合保護。診断Contextの型は将来互換用に保持するが、実診断がない空の「診断」チップは表示・送信しない
- Codexパネルはウィンドウ幅の1/3を既定とし、ドラッグで最小360pxから最大1/2まで変更可能。幅は比率でアプリ全体へ保存し、仕切りのダブルクリックで1/3へ戻せる
- 「現在のファイル」への編集依頼をApp Server組み込み`fileChange`へ明示的に誘導し、チャットへ差分を書くだけでは編集完了としないAgent指示
- Codexのストリーミング応答を最新位置まで自動追従し、過去ログを読むためにスクロールした場合だけ追従を一時停止する会話表示
- 複数の`.inp`/`.pht`が同じワークスペースにあっても、Editorで選択した1件だけを実行対象とする方式。前回本番実行の保守的な状態復元と、状態不明時の重複実行防止

署名なしNSISインストーラーは次のコマンドで生成します。

```powershell
pnpm tauri build --bundles nsis
```

個人利用alpha版はコード署名を行わないため、インストール時にWindows SmartScreenの警告が表示される場合があります。PHITS、Codex、言語資産、認証情報はインストーラーへ含まれません。

## 検証

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
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
node scripts/app-server-edit-smoke.mjs (Get-Command codex).Source .integration
```

`.github/workflows/codex-cli-compatibility.yml`は毎週、最新版Codex CLIからApp Server Schemaを生成し、Editorが利用する4機能の契約を検査します。通常のCLI更新だけではEditorを再配布せず、この検査が失敗した場合にだけ互換対応を判断します。

現在のWindows 11 x64開発PCでは、実App Server承認試験、PHITS／補助ツール実行、公式ラッパーとの5回比較ベンチマークを含むalpha版受入を完了しています。さらに、別のWindows 11 x64端末で、インストーラーによる導入、右クリックの「プログラムから開く」による`.inp`直接起動、編集内容の上書き保存、アンインストールを確認しました。同端末ではCodex接続、開いた`.inp`への編集、差分表示と採用、Ctrl+Zによる復元、および「直前のCodex変更を確認」も動作確認済みです。PHIG-3D連携は開発PCで確認済みですが、別端末ではPHIG-3D自体を起動できなかったため、その端末での連携結果は未判定です。Ubuntu対応とLinux配布物の生成・受入は初回alphaの公開条件には含めず、将来の移植作業として扱います。詳細は [Windows alpha試験報告](docs/windows-alpha-test-report.md) を参照してください。

初回alpha候補の概要は[リリースノート](docs/release-notes-v0.0.1-alpha.md)、
制限事項は[既知の問題](docs/known-issues-v0.0.1-alpha.md)、配布物を作る手順は
[リリース手順](docs/releasing.md)を参照してください。

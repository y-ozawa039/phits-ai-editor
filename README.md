# PHITS AI Editor

日本語 | [English](README.en.md)

PHITS-Padに近い編集・実行機能と、CodexによるAI編集支援を一つの画面に統合したWindows向けエディタです。

## Windows版をダウンロード

初回alpha版はWindows 11 x64専用です。

- **通常利用（推奨）:**
  [インストーラー版をダウンロード](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/PHITS-AI-Editor-v0.0.2-alpha-windows-x64-setup.exe)
- **試用・持ち運び・複数版の比較:**
  [ポータブル版をダウンロード](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/PHITS-AI-Editor-v0.0.2-alpha-windows-x64-portable.zip)
- **ダウンロード後の確認:**
  [SHA-256一覧](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/SHA256SUMS.txt)

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

## 画面と操作デモ

PHITS入力の編集、Codexとの会話、およびCodexが提案した変更の差分確認を、
一つの画面で行えます。

![PHITS AI EditorでCodexの変更差分を確認している画面](docs/assets/demos/phits-ai-editor-overview.png)

次のデモでは、開いているPHITS入力についてCodexへ依頼し、編集内容を
エディタへ反映するまでの流れを確認できます。

![CodexによるPHITS入力編集の操作デモ](docs/assets/demos/codex-editing-demo.gif)

## AI支援を使う前の準備

CodexからPHITSのローカルマニュアルと注意事項を参照できるようにするため、
初回利用前にPHITS公式の`<PHITSPATH>\workbench\README-jp.docx`を確認し、
Codex CLIへ次のように依頼してください。

> PHITSを実行する環境を整えてください。環境変数PHITSPATHが指すフォルダーの
> workbench/execution_setup_for_agent.mdを読み、その内容に従ってください。

セットアップが完了し、`Setup AI agent environment to PHITS is successfully finished.`
と表示されたことを確認してから、PHITS AI EditorでCodexへ接続してください。

エディタは、設定されたPHITSルートを基準に、PHITS用AI設定とCodexが参照する
`AGENTS.md`／`AGENTS.override.md`の状態を検査します。問題がある場合は、画面で
「検査したファイルと理由」を確認でき、診断結果を含む「生成AIへの相談文」を作成・
コピーできます。エディタからCodexへ接続できない場合は、その文章をChatGPT
デスクトップ版のローカルCodexタスクへ貼り付けて調査できます。検査はCodexへの接続や
会話を妨げず、設定の自動変更や相談文の自動送信も行いません。詳しい検査内容と対処方法は
[インストールと初期設定](docs/installation.md)を参照してください。

## 動作環境

- Windows 11 x64（`0.0.2-alpha`の配布対象）
- PHITS実行環境（入力ファイルを実行する場合。`PHITSPATH`からの自動検出または設定画面で指定）
- Codex CLI 0.153.1以降（AI支援を使う場合）

PHITS本体、Codex CLI、認証情報、PHITS言語資産はアプリへ同梱しません。

## ソースから開発する場合

ソースからのビルド、検証、配布物の生成については[ビルド手順](docs/building.md)と
[リリース手順](docs/releasing.md)を参照してください。生成AIを使って用途に合わせて改造する
場合は、[生成AIを使ったカスタマイズ](docs/customizing-with-ai.md)、
[構成](ARCHITECTURE.md)、[安全境界](docs/safety-boundaries.md)も確認してください。

## ライセンスと引用

PHITS AI Editorは[Apache License 2.0](LICENSE)で公開します。著作権者と
研究者識別情報は[AUTHORS.md](AUTHORS.md)、ソフトウェアを研究成果として
引用するための機械可読な情報は[CITATION.cff](CITATION.cff)を参照してください。
第三者依存関係の一覧は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、
配布対象のライセンス・著作権・NOTICE本文は
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)です。
名称・自作ロゴ・改変版の表示方針は[TRADEMARKS.md](TRADEMARKS.md)、脆弱性の
非公開報告方法は[SECURITY.md](SECURITY.md)を参照してください。

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

## Windows alpha版（0.0.2-alpha）

実装済みの主な機能:

- 複数タブでの編集、検索・置換、Undo／Redo、新規作成、保存、名前を付けて保存
- Explorerの「プログラムから開く」やドラッグ＆ドロップによる`.inp`／`.pht`ファイルの直接起動、起動中のウィンドウへの受け渡し、および前回開いていたワークスペースとタブの復元
- エクスプローラー／Codex／出力パネルの表示切替と、エクスプローラー・エディター・Codexの個別文字サイズおよびCodexパネル幅の調整・保存
- UTF-8／BOM付きUTF-8／Windows-31Jと改行形式（CRLF／LF）の保持、一時ファイルを介した安全な上書き保存、直前1世代のバックアップ
- PHITS入力の構文強調、入力補完、および対応する項目の説明表示
- PHITSの通常実行と、エディタおよびCodexを終了して計算用リソースを確保する計算優先実行
- 複数の入力ファイルがある場合でも、選択した1件だけを実行する安全な実行対象管理と重複実行の防止
- ANGEL、DCHAIN、PHIG-3Dとの連携
- Codexとの会話、スレッドの再開・名前変更・削除、モデル選択、および利用可能な機能の互換性表示
- 現在のファイル・選択範囲・未保存内容をCodexへ渡す編集支援と、操作内容に応じた承認設定
- Codexによる変更の全文差分表示、変更箇所間の移動、インライン／左右比較表示、変更の保持・復元
- Codexによる変更後の再読み込み、競合防止、およびUndo／Redo

## 制限事項と確認状況

配布物はコード署名されていないため、インストール時にWindows SmartScreenの警告が
表示される場合があります。

Windows 11 x64の開発環境および別端末で、インストール、ファイル編集・実行、Codex編集支援、
差分確認、Undo／Redo、アンインストールを確認しています。PHIG-3D連携は開発環境のみで
確認済みです。詳細は[Windows alpha試験報告](docs/windows-alpha-test-report.md)を参照してください。
Ubuntu対応とLinux配布物は今後の移植候補であり、現在は提供していません。

現在のalpha版の概要は[リリースノート](docs/release-notes-v0.0.2-alpha.md)、
制限事項は[既知の問題](docs/known-issues-v0.0.2-alpha.md)を参照してください。

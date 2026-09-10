# PHITS AI Editor 0.0.1-alpha

日本語 | [English](release-notes-v0.0.1-alpha.en.md)

PHITS入力エディタと、任意で利用できるローカルCodex CLI連携を組み合わせた、
独立開発・Windows向けプロジェクトの最初の公開alpha候補です。

## どのファイルをダウンロードするか

- 通常利用には
  `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe`を使用してください。
  現在のWindowsユーザー用にインストールし、スタートメニューとアンインストール項目を
  作成し、`.inp`／`.pht`を開けるアプリとして登録します。
- 試用、複数版の比較、開発・調査には
  `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip`をダウンロードし、
  ZIP全体を展開してから実行してください。
- GitHubが自動生成する`Source code (zip)`はWindows用ポータブルアプリでは
  ありません。裸の実行ファイルはRelease資産として配布しません。

`SHA256SUMS.txt`もダウンロードし、実行前に選択した配布物を照合してください。
インストール、初期設定、更新、アンインストールの詳細は
[利用者向けガイド](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/installation.md)
を参照してください。

## 主な機能

- エンコーディングと改行形式を保持するMonaco複数ファイル編集、原子的保存、
  バックアップ、検索、Undo、Redo
- PHITS実行対象1件の明示選択、通常実行・計算優先モード、保守的な実行状態復元、
  ANGEL／DCHAIN／PHIG-3Dの固定経路起動
- Explorerからの`.inp`／`.pht`直接起動、ドラッグ＆ドロップ、単一起動への転送
- PHITSインストール先の自動検出と、アプリ全体の手動パス設定
- Codex App Serverの会話、スレッド管理、上限付きEditor Context、3つの承認モード、
  ファイル変更履歴、競合保護、Monacoのインライン／左右比較
- 起動時のCodex互換性プローブと、最新版CLIに対する定期契約検査

## 必要環境と対象範囲

- 最初にサポートするバイナリはWindows 11 x64です。
- PHITSは含まれません。別途、正規にインストール・ライセンスしてください。
- Codex CLIと認証は含まれません。AI機能を使用する場合だけ必要です。
- インストーラーはコード署名されておらず、Windows SmartScreenが警告を表示する
  場合があります。
- PHITS AI Editorはシステムの`PATH`または`PHITSPATH`を変更しません。
- インストーラーはTauriの現在ユーザー方式を使用し、通常は管理者権限を必要としません。
  WebView2が必要な場合、既定のブートストラッパーはインターネット接続を必要とします。

## 初回起動

1. **設定 → PHITS実行環境**を開き、自動検出結果を確認するかPHITSルートを選択します。
2. AI支援を使う場合は、Codex CLIを別途インストール・認証し、エディタに表示される
   4つの互換性項目を確認します。
3. Explorerから`.inp`／`.pht`を開く、実行ファイルへドラッグする、またはアプリから
   親ワークスペースを開きます。

alpha版には自動更新機能がありません。新しいインストーラーを手動で実行するか、
新しいポータブル版を別フォルダーへ展開してください。

## alpha版に関する警告

重要な入力は使用前にバックアップしてください。本リリースは、ログとソースを調査し、
変更をテストし、自力で環境を復旧できる方を対象とします。本番または安全上重要な作業に
対する保証はなく、個別サポートや回答期限も保証しません。

[インストールガイド](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/installation.md)
と[既知の問題](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/known-issues-v0.0.1-alpha.md)
を確認し、ダウンロードした配布物を実行する前に公開SHA-256値を照合してください。

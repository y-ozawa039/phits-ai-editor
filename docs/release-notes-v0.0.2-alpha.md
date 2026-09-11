# PHITS AI Editor 0.0.2-alpha

日本語 | [English](release-notes-v0.0.2-alpha.en.md)

`0.0.2-alpha`は、PHITS用Codex設定の検査で正しくセットアップされた環境を
未設定と判定する場合があった問題を修正するalpha更新です。

## どのファイルをダウンロードするか

- 通常利用には`PHITS-AI-Editor-v0.0.2-alpha-windows-x64-setup.exe`を使用してください。
- 試用、複数版の比較、開発・調査には
  `PHITS-AI-Editor-v0.0.2-alpha-windows-x64-portable.zip`を展開して使用してください。
- GitHubが自動生成する`Source code (zip)`はWindows用ポータブルアプリではありません。

実行前に`SHA256SUMS.txt`で配布物を照合してください。

## 変更点

- 設定画面の「PHITS実行環境」で解決したルートを判定基準にしました。
- PHITSルート、Codexグローバル、現在のワークスペースで有効な`AGENTS.md`または
  `AGENTS.override.md`を分けて検査します。
- `<PHITSPATH>`、`%PHITSPATH%`、`$PHITSPATH`等の公式変数表記、絶対パス、
  大文字・小文字や区切り文字の違いを認識します。既存の絶対パスはcanonicalizeして
  junction等の別表記も照合します。
- AI設定資源、各指示ファイル、現在のPHITSルートとの整合性を個別に表示します。
- 総合状態を「確認済み」「部分確認」「不一致」「未設定」「読取不能」に分け、
  部分確認は警告ではなく情報として表示します。
- 検査結果にかかわらずCodexへの接続と会話はブロックしません。
- 問題の状態に応じた相談文を生成し、内容とパスを編集してからコピー、または接続済みの
  Codex入力欄へ挿入できます。接続不能時はChatGPTデスクトップ版のローカルCodex
  タスクへ貼り付ける手順を表示します。

この検査はファイルを静的に読むものであり、Codex App Serverがその指示を実際に
読み込んだことを証明するものではありません。Editorは設定ファイルを自動変更しません。

## 対象範囲

公式バイナリ対象は引き続きWindows 11 x64です。PHITS本体、Codex CLI、認証情報は
同梱しません。コード署名されていないalpha版のため、Windows SmartScreenが警告を
表示する場合があります。重要な入力ファイルは必ずバックアップしてください。

詳細は[インストールガイド](installation.md)と
[既知の問題](known-issues-v0.0.2-alpha.md)を参照してください。

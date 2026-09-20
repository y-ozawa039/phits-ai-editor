# 公開状態の確認方法

日本語 | [English](release-status.en.md)

PHITS AI Editorでは、次の状態を区別します。

| 状態 | 意味 |
|---|---|
| CIテスト成果物 | GitHub Actionsから取得できる期限付きビルド。正式Releaseではありません。 |
| リモートタグ | GitHub上で特定コミットを指すタグ。タグだけでは配布物を保証しません。 |
| GitHub Release | タグ、リリース説明、配布物、SHA-256を揃えた正式な公開単位です。 |

公開状況をローカルタグだけから判断してはいけません。次を実行し、ソースの
バージョン、リモートタグ、GitHub Release、期限切れでないActions成果物をまとめて
確認してください。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-release-status.ps1
```

2026-09-21時点では、`v0.0.8-alpha`までが正式なGitHub Releaseです。
`0.0.6-alpha`と`0.0.7-alpha`はCIテスト成果物として配布されましたが、正式な
GitHub Releaseとリモートタグはありません。

CI成果物は利用者がダウンロードできる場合があるため、「未公開」と同義ではありません。
一方、GitHub Releaseとタグが揃うまでは「正式公開済み」とも表現しません。

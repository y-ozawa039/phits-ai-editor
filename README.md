# PHITS AI Editor

PHITS-Pad相当の編集・実行機能と、Codex App ServerによるAI支援を統合するTauriデスクトップアプリです。

## 開発環境

- Windows 11 x64（最初の検証対象）
- Node.js 24 / pnpm 11
- Rust stable / MSVC
- PHITS 3.37（`PHITSPATH`を設定）
- Codex CLI 0.153.1以降（AI機能を使う場合）

```powershell
pnpm install
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm tauri:dev
```

PHITS本体、Codex CLI、認証情報、PHITS言語資産はアプリへ同梱しません。

詳細は [MVP仕様](docs/mvp-specification.md) を参照してください。

## Windows α版

実装済みの主な機能:

- Monacoによる複数タブ編集、検索・置換、Undo/Redo、新規作成、保存、名前を付けて保存
- UTF-8／BOM付きUTF-8／Windows-31JおよびCRLF／LFの保持、原子的保存、1世代バックアップ
- 外部`phits-spec.json`による構文強調、補完、日英ホバー
- 公式ラッパーを使う通常実行と、Editor/Codexを残さない本番実行（計算優先）
- ANGEL、DCHAIN、PHIG-3Dの固定公式経路からの起動
- Codex App Server 0.153.1の遅延起動、複数スレッド関連付け、履歴再開、モデル選択、承認UI
- 前回本番実行の保守的な状態復元と、状態不明時の重複実行防止

署名なしNSISインストーラーは次のコマンドで生成します。

```powershell
pnpm tauri build --bundles nsis
```

個人利用α版はコード署名を行わないため、インストール時にWindows SmartScreenの警告が表示される場合があります。PHITS、Codex、言語資産、認証情報はインストーラーへ含まれません。

## 検証

```powershell
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Windows実機の操作受入、公式ラッパーとの5回比較ベンチマーク、Ubuntu 24.04/26.04実機またはVM検証と`.deb`生成は配布前の未実施項目です。

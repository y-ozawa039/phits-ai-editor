# PHITS AI Editor 公開計画

最終更新: 2026-09-07
状態: Draft（alpha版公開準備）

## 1. 目的

PHITS AI Editorを、次の2つの用途に向けてGitHubで公開する。

1. PHITS入力の編集とCodex支援をすぐに試せる公式alpha版を提供する。
2. 利用者が生成AIと協働し、自分の用途に合わせたEditorを一から作らずに派生・拡張できる基盤を提供する。

公開するEditor本体のライセンスはApache License 2.0とする。PHITS本体、PHITSの実行ファイル・ソース・マニュアル・講習資料、Codex CLI、認証情報、利用者の入力・出力ファイルは公開物へ同梱しない。

## 2. Editorを完成させてから公開準備を始めるべきか

最終仕様の完成を待つ必要はない。ライセンス整備、権利確認、リポジトリ整理、テスト自動化、公開用文書は、Editorの仕様変更と並行して進める。

ただし、公開するコミットを決めた後は短期間の「alpha版機能凍結」を行う。機能凍結中は新機能やUI仕様変更を入れず、データ消失、誤実行、インストール、アンインストール、ライセンス、文書、ビルド再現性に関する問題だけを修正する。

したがって、次の二段階で進める。

- 現在: 仕様変更を続けながら、公開基盤を整備する。
- 公開直前: alpha版の対象機能を凍結し、リリース候補を受入試験する。

「すべての機能が完成したこと」はalpha版公開条件にしない。「既知の制限が明記され、原本保護と実行境界に重大な未解決問題がなく、同じソースから配布物を再生成できること」を公開条件とする。

## 3. 公開形態

### 3.1 GitHubリポジトリ

- 公開先はGitHubを第一候補とする。
- 複数人で管理する場合は、個人アカウントではなくプロジェクトまたは所属組織のGitHub Organization配下を優先する。
- リポジトリ名の第一候補は`phits-ai-editor`とする。
- `main`には、テストを通過し起動可能な状態だけを置く。
- 開発は短命なfeature branchとPull Requestを基本にする。
- 初回公開版は`v0.0.1-alpha`タグを使用する。
- GitHub Releaseでは必ずPre-releaseとして公開する。

GitHub Releasesは、タグに対応するソースアーカイブと、追加した実行ファイル・インストーラー・チェックサムを同じページで配布できる。

- <https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases>
- <https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository>

### 3.2 利用者向けの2つの入口

READMEの冒頭で、次の2経路を同じ重要度で示す。

#### すぐに試す

- 公式ポータブル版ZIPをダウンロードする。
- 必要に応じてNSISインストーラー版を利用する。
- alpha版であること、重要な入力は事前にバックアップすることを明示する。

#### 生成AIとカスタマイズする

- リポジトリをForkまたはCloneする。
- リポジトリ同梱の`AGENTS.md`とカスタマイズガイドをAIへ読ませる。
- テスト、ビルド、公式版へ戻す方法を案内する。
- 生成AIによる変更も、配布・実行前に人間が差分とテスト結果を確認する。

### 3.3 初回alpha版の対応範囲

- 公式バイナリはWindows 11 x64を初回公開対象とする。
- Windows 10はWebView2を含むクリーン環境試験が完了するまで未検証と表示する。
- Ubuntu向けはソース上の将来対象とし、実機またはVM試験と`.deb`受入が完了するまで公式バイナリを公開しない。
- コード署名を導入するまでは、Windows SmartScreen警告が表示され得ることを明記する。

## 4. ライセンスと権利の整理

### 4.1 基本方針

Editor本体、テスト、ビルドスクリプト、Editor固有文書はApache License 2.0で公開する。

通常利用に学術引用を求めない。`CITATION.cff`は研究業績として保持し、Editorが
公開研究へ実質的に貢献した場合に限って任意の引用または謝辞記載を歓迎する。

Apache License 2.0の本文は改変せず、リポジトリ直下の`LICENSE`へ配置する。

- <https://www.apache.org/licenses/LICENSE-2.0>
- <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository>

### 4.2 権利者情報と公開前に確定する事項

著作権者は個人開発者のYohei Ozawaとする。所属機関は本Editorの開発に
関与しておらず、著作権者として表示しない。研究成果としての同一性確認には
GitHubアカウント`@y-ozawa039`とORCID `0009-0004-7814-2778`を用いる。

引き続き公開前に確定する事項:

- PHITS AI Editorという名称を公開リポジトリと配布物へ使用できること
- 現在のロゴを再配布できること
- 改変版による名称・ロゴ使用をどこまで認めるか

所属機関が権利を持つ可能性がある場合は、公開前に知財・法務・情報公開手続を確認する。

### 4.3 用意するファイル

- `LICENSE`: Apache License 2.0正式全文
- `NOTICE`: 著作権者、主要な帰属表示、Codexスキーマ由来情報
- `THIRD_PARTY_NOTICES.md`: npm依存、Rust crate、同梱資産のライセンス一覧
- `TRADEMARKS.md`: 公式名称・ロゴと改変版の表示方針
- `CONTRIBUTING.md`: 投稿コードのライセンス、テスト、AI利用、第三者コード持込みの規則、および自力での調査・復旧を前提とするalpha版のサポート範囲
- `SECURITY.md`: 脆弱性の非公開連絡方法と対応対象バージョン

`Cargo.toml`と`package.json`にもSPDX識別子`Apache-2.0`を記載する。

### 4.4 PHITSとの分離

EditorのライセンスはPHITS本体の利用許諾を含まない。READMEと配布物に次を明記する。

- PHITSはEditorへ同梱されない。
- 利用者はPHITS公式手続に従って自分自身の利用許諾を取得する。
- Editorは利用者のローカルPHITS環境を検出して利用する。
- EditorのApache-2.0ライセンスはPHITSの再配布・再許諾を認めるものではない。

PHITS公式の入手・利用許諾案内:

- <https://phits.jaea.go.jp/getj.html>

### 4.5 Codexと第三者依存

- Codex CLIと認証情報を同梱しない。
- `schemas/codex/0.153.1`はCodex CLIから生成した互換試験用スキーマであることを明記する。
- Codex由来部分についてApache-2.0の帰属表示を保持する。
- npmとCargoの直接・推移依存ライセンスを機械的に列挙し、人間が配布条件を確認する。
- ライセンス不明、独自ライセンス、配布不可の依存または素材が見つかった場合は公開物から除外する。

OpenAI Codexのライセンス:

- <https://github.com/openai/codex/blob/main/docs/license.md>

## 5. リポジトリ公開前の整理

### 5.1 現在の状態

- GitHub remoteはまだ設定されていない。
- `LICENSE`、`NOTICE`、`AUTHORS.md`、`CITATION.cff`を作成済みである。
- `package.json`と`Cargo.toml`へ著者およびSPDXライセンス識別子を反映済みである。
- `THIRD_PARTY_NOTICES.md`は生成済みで、現行の依存メタデータにライセンス不明項目はない。バイナリへ同梱する正式ライセンス本文・帰属表示はリリース前に最終監査する。
- `CONTRIBUTING.md`は作成済みである。セキュリティ・商標文書は未作成である。
- これまでの実装変更と新規ファイルが多数未コミットである。
- Windows release実行ファイルとNSISインストーラーはローカルで生成できている。
- WindowsのクリーンユーザープロファイルまたはVMでのインストール・アンインストール試験は未完了である。

### 5.2 公開対象の棚卸し

次をファイル単位で分類する。

- 公開するソースコード
- 公開するテストと固定スキーマ
- 公開する一般文書
- ローカル試験専用で公開しないファイル
- PHITS利用許諾の対象となるため公開しないファイル
- 利用者固有の入力、出力、設定、会話、履歴
- ビルド生成物、キャッシュ、ログ、一時ファイル

`.gitignore`で少なくとも次を除外する。

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `.integration/`
- `.phits-editor/`
- PHITS入力・出力のうち公開許諾を確認していないもの
- ログ、クラッシュダンプ、認証情報、ローカル設定

拡張子だけで一律除外すると正当なテストfixtureも除外されるため、入力・出力は配置ディレクトリを限定して管理する。

### 5.3 機密・個人情報監査

公開前に現在の作業ツリーだけでなくGit履歴全体を検査する。

- APIキー、アクセストークン、Cookie、Codex認証情報
- 個人名、メールアドレス、組織内部情報
- `C:\Users\...`などの個人環境パス
- 未公開のPHITS入力、出力、研究データ
- 第三者のソース、画像、文書
- 実行ログに含まれるローカルパスやプロセス情報

秘密情報が一度でも履歴へ入っていた場合は、ファイル削除だけでなく資格情報の失効と履歴除去を行う。

### 5.4 コミット整理

現在の変更を無理に1コミットへまとめず、内容が検証できる単位に整理する。

推奨する区分:

1. Editor基盤とPHITS Runner
2. Codex App Server統合と安全境界
3. 差分レビュー、Undo/Redo、変更履歴
4. UI、フォント、配色、ロゴ
5. 直接起動、単一起動、インストーラー
6. テスト、スキーマ、文書
7. ライセンスと公開基盤

過去の作業を破壊的にリセットせず、現状をバックアップしたうえで整理する。

## 6. AIカスタマイズ用の開発者体験

公開意図を実現するため、通常のOSS文書に加えてAIが理解しやすい資料を用意する。

### 6.1 必須文書

- リポジトリ直下の`AGENTS.md`
- `ARCHITECTURE.md`
- `docs/building.md`
- `docs/customizing-with-ai.md`
- `docs/safety-boundaries.md`
- `docs/releasing.md`

### 6.2 `AGENTS.md`に含める内容

- プロジェクトの目的と非目標
- Rust、TypeScript、Tauri、Monacoの責務境界
- PHITS本体とEditorを混同しないこと
- PHITS実行は公式ラッパーを使用すること
- CodexからPHITS系プログラムを直接起動しないこと
- ワークスペース外書込みを許可しないこと
- 原子的保存、バックアップ、文字コード、改行を壊さないこと
- Codex変更はApp Serverイベントと差分レビューを経由すること
- 既存の未コミット変更を破棄しないこと
- 編集後に実行するテストコマンド
- 配布物へPHITS資産・認証情報を混入させないこと

### 6.3 カスタマイズ例

最初は安全で小さい例を掲載する。

- 配色やフォントサイズを変更する
- ツールバー項目を追加する
- PHITSキーワードのホバー表示を追加する
- Codex Composerへ定型依頼を追加する
- 新しい設定値をアプリ全体へ保存する

PHITS実行経路、ファイル保存、承認、パス検証を変更する例は上級者向けとして分離し、必要な回帰試験を併記する。

## 7. CI・セキュリティ・品質管理

### 7.1 GitHub Actions

Pull Requestと`main`へのpushで次を実行する。

- 依存関係の固定状態確認
- TypeScript型検査
- frontend unit test
- frontend production build
- `cargo fmt --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`
- Tauri Windows build
- ライセンス・NOTICE生成結果の差分確認
- 秘密情報スキャン

WindowsバイナリはWindows runnerで生成する。GitHub Actionsの一時artifactだけを一般配布先にせず、公開版はタグに対応するGitHub Releaseへ添付する。

### 7.2 依存関係

- `pnpm-lock.yaml`と`Cargo.lock`をコミットする。
- Dependabotまたは同等の依存更新通知を有効にする。
- 依存更新は自動マージせず、テストとライセンス差分を確認する。
- 重大な脆弱性には`SECURITY.md`記載の非公開窓口を利用する。

### 7.3 ブランチ保護

- `main`へのforce pushを禁止する。
- 必須CIを通過しない変更を`main`へ入れない。
- 管理者を含めてPull Requestを原則とする。
- リリースタグは署名または保護を検討する。
- リリース後に同じタグの成果物を差し替えない。

## 8. alpha版機能凍結と受入条件

### 8.1 機能凍結の開始条件

- 公開するalpha版の機能一覧がREADMEと仕様書で一致している。
- 大きなUI変更の候補が一度整理されている。
- 公開を妨げる権利・名称・ロゴの未決事項が解消している。
- 作業ツリーが意味のあるコミットへ整理されている。
- CIが`main`で動作している。

### 8.2 公開を止める問題

- 入力ファイルの破損または意図しない上書き
- Undo/Redo、バックアップ、競合保護が機能しない
- 選択していない入力をPHITSで実行する
- 同一作業ディレクトリでPHITSを重複実行する
- Codexが承認なしで禁止操作を行う
- ワークスペース外へ書き込む
- PHITS、Codex認証情報、第三者の非公開資産が配布物へ混入する
- インストールまたはアンインストールでユーザーデータを予期せず削除する
- ライセンス・著作権表示が不足している
- Releaseのソースとバイナリが対応していない

### 8.3 alpha版で許容できる問題

既知の制限として明示し、回避策がある場合に限り次を許容する。

- 未実装の補助機能
- UIの軽微な不統一
- コード署名がないことによるSmartScreen警告
- Windows 11 x64以外が未検証であること
- Codex CLIの新しい版に対する未検証警告
- PHITSまたはCodexが未導入の場合に該当機能が使えないこと

## 9. リリース候補の試験

### 9.1 自動試験

- frontend unit testが全件成功
- Rust unit testが全件成功
- TypeScript型検査が成功
- production buildが成功
- Rust formattingとClippyが成功
- release buildが成功
- `git diff --check`が成功
- ライセンス監査が成功
- 秘密情報スキャンが成功

### 9.2 Windowsクリーン環境試験

- 未インストール状態からNSISインストール
- スタートメニューとアプリアイコン
- `.inp`/`.pht`の「プログラムから開く」
- ファイル引数による直接起動
- 二重起動時の既存ウィンドウ転送
- ドラッグ＆ドロップ
- 前回ワークスペースと保存済みタブの復元
- PHITS未導入時の安全な縮退
- `PHITSPATH`設定済み環境、未設定の標準位置、および設定画面からの手動指定でPHITSを検出できること
- 無効なPHITSフォルダーを保存せず、システムの`PATH`と`PHITSPATH`を変更しないこと
- Codex未導入・未認証時の安全な縮退
- PHITS 3.37環境での通常実行
- Codex編集、承認、却下、差分、Undo/Redo
- 上書きインストールによる更新
- アンインストール
- 実行ファイル、ショートカット、ファイル関連付けの除去
- PHITS本体、入力、出力、ワークスペース内`.phits-editor`を削除しないこと
- アプリ設定を残すか削除するかが文書どおりであること

### 9.3 パスとデータ

- 日本語を含むパス
- 空白を含むパス
- 深いパス
- 複数の`.inp`/`.pht`を含むワークスペース
- UTF-8、UTF-8 BOM、Windows-31J
- CRLF、LF
- 未保存編集を含むワークスペース切替
- Codex処理中の手動編集と外部変更

PHITS計算を伴う受入は、既存のPHITS公式ラッパーを使用し、試験用フォルダーで行う。

## 10. Release成果物

初回リリース`v0.0.1-alpha`には次を用意する。

- `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip`
- `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe`
- `SHA256SUMS.txt`
- `SBOM.spdx.json`または同等のSBOM
- `LICENSE`
- `NOTICE`
- `THIRD_PARTY_NOTICES.md`
- Release notes
- Known issues

ポータブルZIPにはexeだけでなく、最低限README、LICENSE、NOTICE、第三者ライセンス、既知の制限を含める。

Release notesには次を明記する。

- alpha版であり本番・安全重要用途向けの保証がないこと
- 対応OSと検証済みPHITS/Codex版
- PHITSとCodex CLIを同梱しないこと
- 重要な入力のバックアップを推奨すること
- 公式版と改変版の識別方法
- インストール・ポータブル利用手順
- 既知の制限
- 不具合報告先
- SHA-256

## 11. GitHub公開手順

1. 著作権者、名称、ロゴ、公開承認を確定する。
2. 公開対象と除外対象を棚卸しする。
3. ライセンス一式と公開文書を追加する。
4. 依存ライセンスと秘密情報を監査する。
5. 現在の未コミット変更を検証可能なコミットへ整理する。
6. GitHub Organizationまたは所有者を決め、非公開リポジトリを作成する。
7. remoteを設定し、まずprivateでpushする。
8. GitHub Actions、branch protection、Issue template、Security policyを設定する。
9. private状態でrelease candidateを生成する。
10. alpha版機能凍結を開始する。
11. 自動試験とWindowsクリーン環境試験を完了する。
12. release candidateのタグ、ソース、バイナリ、SHA-256が対応することを確認する。
13. リポジトリをpublicへ変更する。
14. GitHub ReleaseをPre-releaseとして公開する。
15. 公開直後に別端末からClone、ビルド、ダウンロード、起動を再確認する。

## 12. 公開後の運用

- Issue templateをBug、Feature request、PHITS execution、Codex integrationに分ける。
- 不具合報告ではEditor版、OS、PHITS版、Codex版、再現手順を求める。
- 入力・出力には機密情報が含まれ得るため、公開Issueへの無加工添付を求めない。
- セキュリティ問題は公開Issueではなく`SECURITY.md`の窓口へ誘導する。
- 公式版のサポート範囲と、Fork・改変版が公式サポート対象外であることを明示する。
- 改変版から一般化できる改善をPull Requestとして戻せる導線を用意する。
- alpha版では更新頻度を約束せず、互換性を破る変更があり得ることを明記する。
- 破壊的変更はRelease notesと移行手順へ記載する。

## 13. マイルストーン

### Milestone A: 公開基盤（仕様変更と並行して実施）

- [ ] 著作権者・ロゴ・名称の権利確認（著作権者は確定、名称・ロゴ方針は未確定）
- [x] Apache-2.0適用
- [ ] NOTICE・第三者ライセンス（一覧生成済み、バイナリ同梱物の最終監査は未完了）
- [x] README再構成
- [ ] AGENTS・ARCHITECTURE・カスタマイズガイド
- [x] `.gitignore`と初回公開対象監査（公開直前に再監査する）
- [x] 機密情報・PHITS資産の機械的監査（公開直前に人手で再監査する）
- [x] CI定義構築（GitHub上での初回実行は未実施）
- [ ] Issue・Pull Request・Security template（`CONTRIBUTING.md`は作成済み）

### Milestone B: alpha版機能凍結

- [ ] alpha版対象機能の確定
- [ ] 仕様書と実装の整合
- [ ] 既知の制限確定
- [ ] バージョン・タグ候補確定
- [ ] release candidate生成

### Milestone C: 配布受入

- [ ] 自動試験
- [ ] Windowsクリーン環境
- [ ] インストール・更新・アンインストール
- [ ] ポータブル版
- [ ] PHITS/Codex縮退動作
- [ ] ファイル保護・競合・Undo/Redo
- [ ] SHA-256・SBOM・第三者ライセンス

### Milestone D: GitHub公開

- [ ] privateリポジトリ最終監査
- [ ] public化
- [ ] `v0.0.1-alpha`タグ
- [ ] Pre-release公開
- [ ] 別端末からのClone・ダウンロード確認

## 14. 公開可否判定

次をすべて満たした場合だけ公開する。

- [ ] 公開権限と著作権者表記が確定している。
- [ ] Apache-2.0と第三者ライセンスが正しく同梱されている。
- [ ] PHITSの利用許諾対象物と認証情報が含まれていない。
- [ ] Critical/High相当の既知のデータ消失・誤実行・境界逸脱がない。
- [ ] Windows release候補がクリーン環境でインストール・アンインストールできる。
- [ ] 自動試験と静的解析が成功している。
- [ ] タグ、ソース、バイナリ、チェックサムが対応している。
- [ ] alpha版の制限、無保証、バックアップ推奨、対応環境が明記されている。
- [ ] 公式版と改変版を区別する表示方針がある。

上記を満たさない場合でも、リポジトリをprivateで準備し、生成AI向け文書やCIを整備する作業は継続できる。

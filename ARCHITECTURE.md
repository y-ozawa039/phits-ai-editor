# アーキテクチャ

日本語 | [English](ARCHITECTURE.en.md)

## 概要

PHITS AI EditorはTauri 2デスクトップアプリケーションです。Reactフロントエンドが
Monacoベースのエディタを表示し、Rustバックエンドがファイルシステムアクセス、PHITS
プロセス起動、診断、設定、Codex App Server子プロセスを制御します。

```text
React UI / Monacoモデル
        |
        | 型付きTauriコマンドとイベント
        v
Rust境界層
  | documents | runner | diagnostics | settings | startup
  | Codex App Serverクライアント | Codex変更履歴
        |
        +--> 利用者が選択したワークスペースファイル
        +--> ローカルPHITSインストール（非同梱）
        +--> ローカルCodex CLI / App Server（非同梱）
```

## フロントエンド

現在、`src/App.tsx`がワークスペース状態、タブ、実行、Codexターン、競合、設定を
調整します。テストしやすい規則は次の補助モジュールへ分離しています。

- `src/api.ts`：Tauriコマンドの型付きwrapper
- `src/types.ts`：フロントエンド契約
- `src/phitsLanguage.ts`：Monaco言語登録とPHITS表示
- `src/codexContext.ts`：上限付き`PHITS_EDITOR_CONTEXT_V1`の生成
- `src/codexApproval.ts`：承認の正規化と識別
- `src/codexRevision.ts`：リビジョン競合の判断
- `src/diffReview.ts`：Codexレビューmodelと複数ファイルのgroup化
- `src/editorHistory.ts`：Monaco Undo/Redo利用可否の統合
- `src/uiPreferences.ts`と`src/workspaceSession.ts`：UI・session状態の永続化
- `src/components/`：会話、承認、差分、タブ、dialog

未保存bufferの正本はMonacoです。保存済みファイルと完了したCodex書き込みの正本は
ディスクです。整合処理では、どちらかを暗黙に選ばず両方を比較しなければなりません。

## Rustバックエンド

Tauriコマンドは`src-tauri/src/lib.rs`で登録します。

- `workspace.rs`：ワークスペース検出と境界確認
- `documents.rs`：decode、encode、保存、名前を付けて保存、原子的書き込み、backup
- `runner.rs`：PHITS・補助ツール起動方針とrun manifest
- `diagnostics.rs`：PHITS／Codex検出とApp Server Schema probe
- `settings.rs`：アプリ全体のPHITSパス設定
- `startup.rs`：command line／直接起動要求と単一起動への転送
- `codex.rs`：App Serverのlifecycle、thread、turn、event、approval
- `codex_history.rs`：変更前後snapshot、保留review group、revert
- `contracts.rs`：serialize可能なRust境界型
- `state.rs`：同期されたアプリケーションprocess state

バックエンドがセキュリティ境界です。UI検証は使いやすさを改善しますが、権限付与として
扱ってはいけません。

## 文書のライフサイクル

1. Rustがワークスペースを解決し、相対ファイル名を返します。
2. Rustがbyte列を読み、対応するencodingと改行を検出して`DocumentData`を返します。
3. Monacoがmemory上のmodelを編集し、最後に読込・保存した文書との差から未保存状態を
   管理します。
4. 保存では選択した改行規則だけを正規化し、元のencodingへ再encodeし、1世代backupを
   記録して対象を原子的に置換します。
5. 外部またはCodexの変更はディスクから再読込します。未保存またはリビジョン不一致の
   bufferは上書きせず、競合UIへ進めます。

## Codex編集のライフサイクル

各ユーザーturnには、相対パス、cursor／selection、未保存状態、開いているtab、診断
metadata、上限内の選択・未保存内容を持つ独立した`PHITS_EDITOR_CONTEXT_V1`項目を添付
できます。Contextは利用者のchat本文として表示しません。

実際の編集はApp Serverの`fileChange`およびdiff eventで識別します。変更前に
バックエンドがパスを検証し、before snapshotを記録します。完了後にafter snapshotを
記録して、複数ファイルに対応するreview可能な履歴groupを通知します。UIはディスクを
再読込し、競合を検出して、インラインまたは左右比較のMonaco diffを表示します。
Undo/RedoはMonaco編集へ適用し、永続Codex review履歴から完了済み変更を再表示・復元
できます。

## PHITS実行のライフサイクル

エディタで選択した入力だけを実行します。runnerは相対パスを検証し、インストール済み
PHITS環境を解決し、安全でない重複実行を防止して、アプリ再起動後に状態を保守的に復元
できるrun manifestを書き込みます。通常実行と計算優先モードでは、エディタ／Codex環境を
維持する範囲が異なりますが、どちらも入力の明示的な帰属を維持します。

## 互換性方針

Codex CLI 0.153.1 App Server Schemaを固定した最小契約とします。起動時にインストール
済みCLIのSchemaを生成・検査し、chat、thread、file editing、approvalの利用可否を個別に
公開します。安全な場合は新しいfieldを許容しますが、必須methodの欠落や未知のapproval
decisionは許容しません。定期GitHub workflowでも最新版CLIに対して同じ検査を行います。

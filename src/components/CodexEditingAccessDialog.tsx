import { useEffect, useRef } from "react";

export function CodexEditingAccessDialog({
  mode,
  workspaceRoot,
  modelLabel,
  reasoning,
  busy,
  onCancel,
  onConfirm,
}: {
  mode: "liveProbe" | "override";
  workspaceRoot: string;
  modelLabel: string;
  reasoning: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const probe = mode === "liveProbe";

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, onCancel]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialogRef} tabIndex={-1} className="diagnostic-dialog codex-editing-access-dialog" role="dialog" aria-modal="true" aria-labelledby="codex-editing-access-title">
      <h2 id="codex-editing-access-title">{probe ? "実際のCodex編集経路を確認" : "診断結果にかかわらず編集を許可"}</h2>
      {probe ? <>
        <p>ワークスペース直下に検査用の一時テキストファイルを1つ作成し、Codexにそのファイルの1行だけを書き換えさせます。書換え結果を確認した後、一時ファイルは自動的に削除します。</p>
        <dl className="codex-editing-access-summary">
          <div><dt>使用モデル</dt><dd>{modelLabel}</dd></div>
          <div><dt>思考</dt><dd>{reasoning || "既定設定"}</dd></div>
          <div><dt>対象</dt><dd title={workspaceRoot}>{workspaceRoot}</dd></div>
        </dl>
        <p className="diagnostic-privacy-note">研究ファイルやPHITS計算には触れません。「検査を開始」を押すと、上記の一時ファイル変更だけを自動的に許可してCodexの1回分の処理を使用します。</p>
      </> : <>
        <p>自動診断ではCodexの編集可否を確認できませんでした。診断結果に基づくエディタ側の制限だけを、現在のワークスペースと接続中に限って解除します。</p>
        <p className="diagnostic-privacy-note">CodexのSandbox、承認設定、ワークスペース境界、PHITS実行の検証は変更しません。ファイル変更が失敗した場合は、App Serverから返された実際のエラーを確認できます。</p>
        <dl className="codex-editing-access-summary"><div><dt>対象</dt><dd title={workspaceRoot}>{workspaceRoot}</dd></div></dl>
      </>}
      <div className="diagnostic-dialog-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>キャンセル</button>
        <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? (probe ? "編集経路を確認中…" : "設定中…") : probe ? "検査を開始" : "編集を許可"}</button>
      </div>
    </section>
  </div>;
}

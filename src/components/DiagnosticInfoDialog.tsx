import { useEffect, useRef } from "react";

export function DiagnosticInfoDialog({
  startupLog,
  onOpenLogFolder,
  onCopyLogPath,
  onClose,
}: {
  startupLog: string | null;
  onOpenLogFolder: () => void;
  onCopyLogPath: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="diagnostic-dialog diagnostic-info-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-info-title">
      <h2 id="diagnostic-info-title">診断情報の詳細</h2>
      <p>起動、基本診断、Codex接続の段階を記録し、不具合発生時の調査に使用します。</p>
      <dl className="diagnostic-info-list">
        <div><dt>起動ログ</dt><dd><code>{startupLog ?? "保存場所を取得できませんでした"}</code></dd></div>
        <div><dt>保持方法</dt><dd>256 KiBを上限とし、過去ログを<code>startup.previous.log</code>として1世代保持します。</dd></div>
        <div><dt>記録しない情報</dt><dd>ワークスペースのパス、入力ファイルの内容、認証情報は記録しません。</dd></div>
        <div><dt>診断結果の扱い</dt><dd>診断結果、保存済みレポート、起動ログを次回の利用可否判定へ再利用しません。</dd></div>
        <div><dt>レポートのパス伏せ</dt><dd>ワークスペース、PHITS、Codex CLI、ユーザーフォルダーなどの既知のローカルパスを置き換えます。</dd></div>
      </dl>
      <div className="diagnostic-info-actions">
        <button type="button" className="secondary-button" onClick={onOpenLogFolder} disabled={!startupLog}>ログフォルダーを開く</button>
        <button type="button" className="secondary-button" onClick={onCopyLogPath} disabled={!startupLog}>起動ログのパスをコピー</button>
      </div>
      <div className="diagnostic-dialog-actions">
        <button type="button" className="primary-button" onClick={onClose}>閉じる</button>
      </div>
    </section>
  </div>;
}

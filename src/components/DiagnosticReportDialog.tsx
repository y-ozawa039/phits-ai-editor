import { useEffect, useRef, useState } from "react";

export function DiagnosticReportDialog({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (anonymize: boolean) => void;
}) {
  const [anonymize, setAnonymize] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialogRef} tabIndex={-1} className="diagnostic-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-report-title">
      <h2 id="diagnostic-report-title">診断レポートを保存</h2>
      <fieldset className="diagnostic-save-options">
        <legend>保存する内容</legend>
        <label>
          <input type="radio" name="diagnostic-report-privacy" checked={anonymize} onChange={() => setAnonymize(true)} />
          <span><strong>ユーザー名・作業フォルダーなどのパスを伏せて保存（推奨）</strong><small>ワークスペース、PHITS、Codex CLI、ユーザーフォルダーなどの既知のパスを&lt;WORKSPACE&gt;などの表記へ置き換えます。</small></span>
        </label>
        <label>
          <input type="radio" name="diagnostic-report-privacy" checked={!anonymize} onChange={() => setAnonymize(false)} />
          <span><strong>パスを伏せずに保存</strong><small>実際のフォルダー構成を残します。</small></span>
        </label>
      </fieldset>
      <p className="diagnostic-privacy-note">既知のローカルパスを置き換えますが、エラーメッセージやフォルダー名に個人情報が含まれる場合があります。外部へ共有する場合は内容をよくご確認ください。</p>
      <div className="diagnostic-dialog-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>キャンセル</button>
        <button type="button" className="primary-button" onClick={() => onSave(anonymize)}>保存…</button>
      </div>
    </section>
  </div>;
}

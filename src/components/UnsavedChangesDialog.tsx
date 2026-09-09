import { useId } from "react";

interface UnsavedChangesDialogProps {
  fileName: string;
  busy: boolean;
  title?: string;
  warning?: string;
  discardLabel?: string;
  saveLabel?: string;
  busyLabel?: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function UnsavedChangesDialog({
  fileName,
  busy,
  title = "変更を保存しますか？",
  warning = "保存せず閉じると、この変更は失われます。",
  discardLabel = "保存せず閉じる",
  saveLabel = "保存して閉じる",
  busyLabel = "保存中…",
  onCancel,
  onDiscard,
  onSave,
}: UnsavedChangesDialogProps) {
  const titleId = useId();
  return <div className="modal-backdrop">
    <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p><strong>{fileName}</strong> には未保存の変更があります。</p>
      <p className="unsaved-dialog-note">{warning}</p>
      <div className="unsaved-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel} autoFocus>キャンセル</button>
        <button type="button" className="danger-ghost-button" disabled={busy} onClick={onDiscard}>{discardLabel}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={onSave}>{busy ? busyLabel : saveLabel}</button>
      </div>
    </section>
  </div>;
}

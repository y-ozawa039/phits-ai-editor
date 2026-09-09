import { DiffEditor, type DiffBeforeMount, type DiffOnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { changeKindLabel, languageForPath } from "../codexApproval";
import type { DiffReviewState } from "../diffReview";
import type { ApprovalDecision, ApprovalRequest } from "../types";

interface DiffReviewProps {
  review: DiffReviewState;
  approval?: ApprovalRequest;
  fontSize: number;
  beforeMount?: DiffBeforeMount;
  onSelectFile: (index: number) => void;
  onDecision: (decision: ApprovalDecision) => void;
  onFinalize?: (choice: CompletedChangeChoice) => void | Promise<void>;
  onClose: () => void;
}

export type CompletedChangeChoice = "keep" | "revert";

const SIDE_BY_SIDE_MIN_WIDTH = 760;

export function DiffReview({ review, approval, fontSize, beforeMount, onSelectFile, onDecision, onFinalize, onClose }: DiffReviewProps) {
  const [requestedSideBySide, setRequestedSideBySide] = useState(false);
  const [completedChangeChoice, setCompletedChangeChoice] = useState<CompletedChangeChoice>("keep");
  const [finalizing, setFinalizing] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(SIDE_BY_SIDE_MIN_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
  const navigationDisposablesRef = useRef<Array<{ dispose(): void }>>([]);
  const centerFrameRef = useRef<number | null>(null);
  const wrappingFrameRef = useRef<number | null>(null);
  const selected = review.files[review.selectedFileIndex] ?? review.files[0];
  const [hunkPosition, setHunkPosition] = useState({ current: selected?.hunkCount ? 1 : 0, total: selected?.hunkCount ?? 0 });
  const canUseSideBySide = availableWidth >= SIDE_BY_SIDE_MIN_WIDTH;
  const renderSideBySide = requestedSideBySide && canUseSideBySide;
  const commonWrapColumn = Math.max(24, Math.min(100, Math.floor((availableWidth / 2 - 112) / (fontSize * 0.62))));
  const hasError = review.files.some((file) => file.error);

  useEffect(() => {
    setCompletedChangeChoice("keep");
    setFinalizing(false);
  }, [review.groupId, review.itemId]);

  const finalizeCompletedChange = async () => {
    if (!onFinalize || finalizing) return;
    setFinalizing(true);
    try {
      await onFinalize(completedChangeChoice);
    } finally {
      setFinalizing(false);
    }
  };

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setHunkPosition({ current: selected?.hunkCount ? 1 : 0, total: selected?.hunkCount ?? 0 });
  }, [selected?.diff, selected?.hunkCount, selected?.path]);

  useLayoutEffect(() => () => {
    navigationDisposablesRef.current.forEach((disposable) => disposable.dispose());
    navigationDisposablesRef.current = [];
    if (centerFrameRef.current !== null) cancelAnimationFrame(centerFrameRef.current);
    if (wrappingFrameRef.current !== null) cancelAnimationFrame(wrappingFrameRef.current);
  }, []);

  const updateHunkPosition = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    const changes = editor.getLineChanges();
    if (!changes?.length) {
      setHunkPosition({ current: selected?.hunkCount ? 1 : 0, total: selected?.hunkCount ?? 0 });
      return;
    }
    const line = editor.getModifiedEditor().getPosition()?.lineNumber ?? changes[0].modifiedStartLineNumber;
    let current = 0;
    for (let index = 0; index < changes.length; index += 1) {
      if (changes[index].modifiedStartLineNumber <= line) current = index;
      else break;
    }
    setHunkPosition({ current: current + 1, total: changes.length });
  }, [selected?.hunkCount]);

  const synchronizeWrapping = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    if (!renderSideBySide) return;
    const options: MonacoEditor.IEditorOptions = {
      wordWrap: "wordWrapColumn",
      wordWrapColumn: commonWrapColumn,
      wordWrapOverride1: "inherit",
      wordWrapOverride2: "inherit",
      colorDecorators: false,
    };
    editor.getOriginalEditor().updateOptions(options);
    editor.getModifiedEditor().updateOptions(options);
  }, [commonWrapColumn, renderSideBySide]);

  const scheduleWrappingSynchronization = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    if (wrappingFrameRef.current !== null) cancelAnimationFrame(wrappingFrameRef.current);
    synchronizeWrapping(editor);
    // Monacoはインライン表示で変更前ペインのwordWrapOverride2をoffにする。
    // 表示モード更新後にも再適用し、左右比較へ戻した際のoff残留を防ぐ。
    wrappingFrameRef.current = requestAnimationFrame(() => {
      wrappingFrameRef.current = requestAnimationFrame(() => {
        synchronizeWrapping(editor);
        wrappingFrameRef.current = null;
      });
    });
  }, [synchronizeWrapping]);

  const centerModifiedDiffLine = useCallback((editor: MonacoEditor.IStandaloneDiffEditor, requestedLine: number) => {
    const modifiedEditor = editor.getModifiedEditor();
    const applyCenter = () => {
      const model = modifiedEditor.getModel();
      if (!model) return;
      const lineNumber = Math.max(1, Math.min(requestedLine, model.getLineCount()));
      modifiedEditor.setPosition({ lineNumber, column: 1 });
      modifiedEditor.revealLineInCenter(lineNumber);
      const lineTop = modifiedEditor.getTopForLineNumber(lineNumber);
      const viewportHeight = modifiedEditor.getLayoutInfo().height;
      const lineHeight = Math.round(fontSize * 1.55);
      modifiedEditor.setScrollTop(Math.max(0, lineTop - (viewportHeight - lineHeight) / 2));
    };

    if (centerFrameRef.current !== null) cancelAnimationFrame(centerFrameRef.current);
    applyCenter();
    // Diff Editorは末尾の空白行に対応する整列用View Zoneを遅れて再計算する。
    // レイアウトが落ち着いた後にも中央配置を再適用し、EOF付近でも追従させる。
    centerFrameRef.current = requestAnimationFrame(() => {
      centerFrameRef.current = requestAnimationFrame(() => {
        applyCenter();
        centerFrameRef.current = null;
      });
    });
  }, [fontSize]);

  useLayoutEffect(() => {
    const editor = diffEditorRef.current;
    if (editor) scheduleWrappingSynchronization(editor);
  }, [scheduleWrappingSynchronization]);

  const onMount: DiffOnMount = (editor) => {
    navigationDisposablesRef.current.forEach((disposable) => disposable.dispose());
    diffEditorRef.current = editor;
    scheduleWrappingSynchronization(editor);
    const refresh = () => updateHunkPosition(editor);
    navigationDisposablesRef.current = [
      editor.onDidUpdateDiff(refresh),
      editor.getModifiedEditor().onDidChangeCursorPosition(refresh),
    ];
    void Promise.resolve(editor.revealFirstDiff()).then(refresh);
  };
  const navigateDiff = (target: "previous" | "next") => {
    const editor = diffEditorRef.current;
    if (editor) {
      const changes = editor.getLineChanges();
      if (changes?.length) {
        const currentIndex = Math.max(0, Math.min(changes.length - 1, hunkPosition.current - 1));
        const targetIndex = changes.length === 1
          ? 0
          : target === "next"
            ? (currentIndex + 1) % changes.length
            : (currentIndex + changes.length - 1) % changes.length;
        const targetLine = Math.max(1, changes[targetIndex].modifiedStartLineNumber);
        setHunkPosition({ current: targetIndex + 1, total: changes.length });
        centerModifiedDiffLine(editor, targetLine);
        return;
      }

      editor.goToDiff(target);
      requestAnimationFrame(() => {
        const lineNumber = editor.getModifiedEditor().getPosition()?.lineNumber;
        if (lineNumber) centerModifiedDiffLine(editor, lineNumber);
        updateHunkPosition(editor);
      });
      return;
    }
    setHunkPosition((current) => current.total <= 1 ? current : {
      ...current,
      current: target === "next"
        ? current.current % current.total + 1
        : (current.current + current.total - 2) % current.total + 1,
    });
  };
  const statusLabel = review.status === "awaitingApproval"
    ? "変更操作の承認待ち"
    : review.status === "resolving"
      ? "許可を送信中…"
      : review.status === "reverting"
        ? "復元中…"
        : review.status === "reverted"
          ? "復元済み"
          : review.status === "pendingReview"
            ? "Codexの変更・未確認"
            : review.status === "reviewed"
              ? "確認済み"
              : review.status === "conflicted"
                ? "競合"
                : "失敗";

  return <section className="main-diff-review" ref={containerRef} aria-label="Codex差分レビュー">
    <header className="diff-review-toolbar">
      <div className="diff-review-title"><strong>Codexの変更</strong><span className={`diff-review-status ${review.status}`}>{statusLabel}</span></div>
      <div className="diff-review-file-nav">
        <button type="button" className="icon-text-button" disabled={review.selectedFileIndex <= 0} onClick={() => onSelectFile(review.selectedFileIndex - 1)} aria-label="前の変更ファイル">‹</button>
        <span title={selected?.movedTo ? `${selected.path} → ${selected.movedTo}` : selected?.path}>{selected ? (selected.movedTo ? `${selected.path} → ${selected.movedTo}` : selected.path) : "変更ファイルなし"}</span>
        <small>{review.files.length ? `${review.selectedFileIndex + 1} / ${review.files.length}` : "0 / 0"}</small>
        <button type="button" className="icon-text-button" disabled={review.selectedFileIndex >= review.files.length - 1} onClick={() => onSelectFile(review.selectedFileIndex + 1)} aria-label="次の変更ファイル">›</button>
      </div>
      <div className="diff-review-actions">
        <span className="diff-review-hunk-position" aria-live="polite">変更 {hunkPosition.current} / {hunkPosition.total}</span>
        <button type="button" className="secondary-button compact" onClick={() => navigateDiff("previous")} disabled={hunkPosition.total === 0} title="前の変更箇所">前の差分</button>
        <button type="button" className="secondary-button compact" onClick={() => navigateDiff("next")} disabled={hunkPosition.total === 0} title="次の変更箇所">次の差分</button>
        <div className="diff-display-mode" role="group" aria-label="差分の表示方式">
          <button type="button" className={!renderSideBySide ? "selected" : ""} aria-pressed={!renderSideBySide} onClick={() => setRequestedSideBySide(false)} title="差分を1つのエディター内に表示">インライン表示</button>
          <button type="button" className={renderSideBySide ? "selected" : ""} aria-pressed={renderSideBySide} onClick={() => setRequestedSideBySide(true)} disabled={!canUseSideBySide} title={canUseSideBySide ? "変更前と変更後を左右に並べて表示" : "表示幅が狭いため左右比較を利用できません"}>左右比較</button>
        </div>
        {review.mode === "operationApproval" && review.status === "awaitingApproval" && <>
          {approval?.availableDecisions?.includes("decline") && <button type="button" className="danger-ghost-button" onClick={() => onDecision("decline")}>拒否</button>}
          {approval?.availableDecisions?.includes("cancel") && <button type="button" className="danger-ghost-button" onClick={() => onDecision("cancel")}>中止</button>}
          {approval?.availableDecisions?.includes("acceptForSession") && <button type="button" className="secondary-button compact" disabled={hasError} onClick={() => onDecision("acceptForSession")}>接続中許可</button>}
          {approval?.availableDecisions?.includes("accept") && <button type="button" className="primary-button" disabled={hasError} onClick={() => onDecision("accept")}>今回のみ許可</button>}
        </>}
        {(review.status === "pendingReview" || review.status === "reviewed") && <>
          <div className="diff-review-resolution" role="group" aria-label="差分を閉じるときの処理">
            <button type="button" className={completedChangeChoice === "keep" ? "selected" : ""} aria-pressed={completedChangeChoice === "keep"} onClick={() => setCompletedChangeChoice("keep")} disabled={finalizing}>変更を保持</button>
            <button type="button" className={completedChangeChoice === "revert" ? "selected" : ""} aria-pressed={completedChangeChoice === "revert"} onClick={() => setCompletedChangeChoice("revert")} disabled={finalizing || !review.historyIds?.length}>元に戻す</button>
          </div>
          <button type="button" className="primary-button" onClick={() => void finalizeCompletedChange()} disabled={finalizing}>{finalizing ? "処理中…" : "差分を閉じる"}</button>
        </>}
        {review.status === "reverted" && <button type="button" className="primary-button" onClick={onClose}>差分を閉じる</button>}
      </div>
    </header>
    {!canUseSideBySide && requestedSideBySide && <div className="diff-review-notice">表示幅が狭いためインライン表示に切り替えています。</div>}
    {selected?.error ? <div className="diff-review-error"><strong>安全に差分を表示できませんでした。</strong><span>{selected.error}</span><span>{review.mode === "operationApproval" ? "この操作は許可せず、Codexへ変更案の再作成を依頼してください。" : "現在のファイルを変更せず、履歴情報だけを保持しています。"}</span></div> : selected ? <>
      <div className="diff-review-file-heading"><span>{changeKindLabel(selected.kind)}</span><span>{selected.hunkCount}か所の変更</span><span>緑: 追加　赤: 削除</span></div>
      {renderSideBySide && <div className="diff-review-side-labels" aria-label="差分の左右">
        <strong>変更前</strong>
        <strong>変更後</strong>
      </div>}
      <div className="diff-review-editor">
        <DiffEditor
          key={`${selected.path}:${renderSideBySide}`}
          height="100%"
          original={selected.original}
          modified={selected.modified}
          language={languageForPath(selected.path)}
          theme="phits-light"
          beforeMount={beforeMount}
          onMount={onMount}
          options={{
            readOnly: true,
            originalEditable: false,
            renderSideBySide,
            ignoreTrimWhitespace: false,
            enableSplitViewResizing: true,
            splitViewDefaultRatio: 0.5,
            minimap: { enabled: false },
            lineNumbers: "on",
            glyphMargin: true,
            folding: false,
            renderOverviewRuler: true,
            scrollBeyondLastLine: true,
            wordWrap: "wordWrapColumn",
            wordWrapColumn: commonWrapColumn,
            wordWrapOverride1: "inherit",
            wordWrapOverride2: "inherit",
            diffWordWrap: "inherit",
            colorDecorators: false,
            fontFamily: '"Cascadia Mono", "Consolas", monospace',
            fontSize,
            lineHeight: Math.round(fontSize * 1.55),
            automaticLayout: true,
          }}
        />
      </div>
    </> : <div className="diff-review-error">表示できる変更がありません。</div>}
  </section>;
}

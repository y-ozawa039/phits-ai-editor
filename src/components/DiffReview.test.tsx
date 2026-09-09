import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffReview } from "./DiffReview";
import type { ApprovalRequest } from "../types";

const monacoMock = vi.hoisted(() => ({ onMount: undefined as undefined | ((editor: unknown) => void) }));

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: ({ original, modified, options, onMount }: { original: string; modified: string; options?: { ignoreTrimWhitespace?: boolean; wordWrapOverride1?: string; wordWrapOverride2?: string; colorDecorators?: boolean }; onMount?: (editor: unknown) => void }) => {
    monacoMock.onMount = onMount;
    return <div
      data-testid="main-diff"
      data-ignore-trim-whitespace={String(options?.ignoreTrimWhitespace)}
      data-word-wrap-override-1={options?.wordWrapOverride1}
      data-word-wrap-override-2={options?.wordWrapOverride2}
      data-color-decorators={String(options?.colorDecorators)}
    ><span>{original}</span><span>{modified}</span></div>;
  },
}));

const approval: ApprovalRequest = {
  requestId: 1,
  method: "item/fileChange/requestApproval",
  kind: "fileChange" as const,
  availableDecisions: ["accept", "decline"],
  changes: [{ path: "main.inp", kind: { type: "update" }, diff: "@@ -1 +1,2 @@\n+TEST\n $MPI=15" }],
};

describe("DiffReview", () => {
  it("shows the complete proposal and resolves the whole request", () => {
    const onDecision = vi.fn();
    render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "$MPI=15", modified: "TEST\n$MPI=15", diff: approval.changes[0].diff, hunkCount: 1 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={onDecision} onClose={vi.fn()} />);
    expect(screen.getByTestId("main-diff")).toHaveTextContent("TEST");
    expect(screen.getByText("1か所の変更")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "今回のみ許可" }));
    expect(onDecision).toHaveBeenCalledWith("accept");
  });

  it("blocks acceptance when the proposal cannot be reconstructed", () => {
    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "current", modified: "current", diff: "bad", hunkCount: 0, error: "stale" }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("安全に差分を表示できませんでした。")).toBeInTheDocument();
    expect(container.querySelector<HTMLButtonElement>(".diff-review-actions .primary-button")).toBeDisabled();
  });

  it("navigates between every file in one atomic App Server request", () => {
    const onSelectFile = vi.fn();
    const multiApproval: ApprovalRequest = { ...approval, changes: [approval.changes[0], { path: "notes.txt", kind: { type: "add" }, diff: "@@ -0,0 +1 @@\n+note" }] };
    const { container } = render(<DiffReview review={{ files: [
      { path: "main.inp", kind: "update", original: "old", modified: "new", diff: approval.changes[0].diff, hunkCount: 1 },
      { path: "notes.txt", kind: "add", original: "", modified: "note", diff: multiApproval.changes[1].diff, hunkCount: 1 },
    ], selectedFileIndex: 0, status: "awaitingApproval", mode: "operationApproval" }} approval={multiApproval} fontSize={14} onSelectFile={onSelectFile} onDecision={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="次の変更ファイル"]')!);
    expect(onSelectFile).toHaveBeenCalledWith(1);
  });

  it("always identifies the original and modified sides in side-by-side mode", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 900, height: 600, top: 0, right: 900, bottom: 600, left: 0, x: 0, y: 0, toJSON: () => ({}) });
    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "old", modified: "new", diff: approval.changes[0].diff, hunkCount: 1 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    const review = within(container);
    expect(review.getByRole("button", { name: "インライン表示" })).toHaveAttribute("aria-pressed", "true");
    expect(review.getByRole("button", { name: "左右比較" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(review.getByRole("button", { name: "左右比較" }));
    expect(review.getByRole("button", { name: "インライン表示" })).toHaveAttribute("aria-pressed", "false");
    expect(review.getByRole("button", { name: "左右比較" })).toHaveAttribute("aria-pressed", "true");
    expect(review.getByText("変更前")).toBeInTheDocument();
    expect(review.getByText("変更後")).toBeInTheDocument();
    expect(container.querySelector(".diff-review-side-labels")).toBeInTheDocument();
    expect(review.getByTestId("main-diff")).toHaveAttribute("data-word-wrap-override-1", "inherit");
    expect(review.getByTestId("main-diff")).toHaveAttribute("data-word-wrap-override-2", "inherit");
    bounds.mockRestore();
  });

  it("disables side-by-side mode when the review area is too narrow", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 600, top: 0, right: 600, bottom: 600, left: 0, x: 0, y: 0, toJSON: () => ({}) });
    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "old", modified: "new", diff: approval.changes[0].diff, hunkCount: 1 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    const review = within(container);
    expect(review.getByRole("button", { name: "インライン表示" })).toHaveAttribute("aria-pressed", "true");
    expect(review.getByRole("button", { name: "左右比較" })).toBeDisabled();
    expect(review.getByRole("button", { name: "左右比較" })).toHaveAttribute("title", "表示幅が狭いため左右比較を利用できません");
    bounds.mockRestore();
  });

  it("shows the current hunk position and advances it with navigation", () => {
    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "old", modified: "new", diff: "three-hunks", hunkCount: 3 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    const review = within(container);
    expect(review.getByText("変更 1 / 3")).toBeInTheDocument();
    fireEvent.click(review.getByRole("button", { name: "次の差分" }));
    expect(review.getByText("変更 2 / 3")).toBeInTheDocument();
    fireEvent.click(review.getByRole("button", { name: "前の差分" }));
    expect(review.getByText("変更 1 / 3")).toBeInTheDocument();
  });

  it("keeps whitespace-only changes visible and locatable", () => {
    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "[end]\n", modified: "\n[end]\n", diff: "blank-line-hunk", hunkCount: 1 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    const review = within(container);
    expect(review.getByTestId("main-diff")).toHaveAttribute("data-ignore-trim-whitespace", "false");
    expect(review.getByRole("button", { name: "前の差分" })).toBeEnabled();
    expect(review.getByRole("button", { name: "次の差分" })).toBeEnabled();
    expect(review.getByTestId("main-diff")).toHaveAttribute("data-color-decorators", "false");
  });

  it("centers a trailing blank-line hunk instead of only revealing the end of the file", () => {
    let modifiedLine = 1;
    const revealLineInCenter = vi.fn();
    const setScrollTop = vi.fn();
    const modifiedEditor = {
      updateOptions: vi.fn(),
      onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
      getPosition: vi.fn(() => ({ lineNumber: modifiedLine, column: 1 })),
      getModel: vi.fn(() => ({ getLineCount: () => 1145 })),
      setPosition: vi.fn(({ lineNumber }: { lineNumber: number }) => { modifiedLine = lineNumber; }),
      revealLineInCenter,
      getTopForLineNumber: vi.fn((lineNumber: number) => lineNumber * 20),
      getLayoutInfo: vi.fn(() => ({ height: 600 })),
      setScrollTop,
    };
    const lineChanges = [1, 5, 1144].map((lineNumber) => ({
      originalStartLineNumber: lineNumber,
      originalEndLineNumber: lineNumber,
      modifiedStartLineNumber: lineNumber,
      modifiedEndLineNumber: lineNumber,
    }));
    const diffEditor = {
      getOriginalEditor: () => ({ updateOptions: vi.fn() }),
      getModifiedEditor: () => modifiedEditor,
      getLineChanges: () => lineChanges,
      onDidUpdateDiff: vi.fn(() => ({ dispose: vi.fn() })),
      revealFirstDiff: vi.fn(),
      goToDiff: vi.fn(),
    };

    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "old", modified: "new", diff: "three-hunks", hunkCount: 3 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    const review = within(container);
    act(() => monacoMock.onMount?.(diffEditor));
    fireEvent.click(review.getByRole("button", { name: "次の差分" }));
    fireEvent.click(review.getByRole("button", { name: "次の差分" }));

    expect(modifiedEditor.setPosition).toHaveBeenLastCalledWith({ lineNumber: 1144, column: 1 });
    expect(revealLineInCenter).toHaveBeenLastCalledWith(1144);
    expect(setScrollTop).toHaveBeenLastCalledWith(22591);
    expect(diffEditor.goToDiff).not.toHaveBeenCalled();
  });

  it("reapplies identical wrapping overrides to both panes after switching layouts", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 900, height: 600, top: 0, right: 900, bottom: 600, left: 0, x: 0, y: 0, toJSON: () => ({}) });
    const originalUpdateOptions = vi.fn();
    const modifiedUpdateOptions = vi.fn();
    const diffEditor = {
      getOriginalEditor: () => ({ updateOptions: originalUpdateOptions }),
      getModifiedEditor: () => ({
        updateOptions: modifiedUpdateOptions,
        onDidChangeCursorPosition: () => ({ dispose: vi.fn() }),
        getPosition: () => ({ lineNumber: 1, column: 1 }),
      }),
      getLineChanges: () => [{ originalStartLineNumber: 1, originalEndLineNumber: 1, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 }],
      onDidUpdateDiff: () => ({ dispose: vi.fn() }),
      revealFirstDiff: vi.fn(),
    };

    const { container } = render(<DiffReview review={{ mode: "operationApproval", files: [{ path: "main.inp", kind: "update", original: "old", modified: "new", diff: approval.changes[0].diff, hunkCount: 1 }], selectedFileIndex: 0, status: "awaitingApproval" }} approval={approval} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(within(container).getByRole("button", { name: "左右比較" }));
    act(() => monacoMock.onMount?.(diffEditor));

    expect(originalUpdateOptions).toHaveBeenCalledWith(expect.objectContaining({ wordWrapOverride1: "inherit", wordWrapOverride2: "inherit", colorDecorators: false }));
    expect(modifiedUpdateOptions).toHaveBeenCalledWith(expect.objectContaining({ wordWrapOverride1: "inherit", wordWrapOverride2: "inherit", colorDecorators: false }));
    bounds.mockRestore();
  });

  it("defers the keep or revert choice until the review is closed", () => {
    const onFinalize = vi.fn();
    const reviewState = {
      files: [{ path: "main.inp", kind: "update", original: "before", modified: "after", diff: "", hunkCount: 1 }],
      selectedFileIndex: 0,
      mode: "completedChange" as const,
      status: "pendingReview" as const,
      historyIds: ["history-1"],
    };
    const view = render(<DiffReview review={reviewState} fontSize={14} onSelectFile={vi.fn()} onDecision={vi.fn()} onFinalize={onFinalize} onClose={vi.fn()} />);
    expect(within(view.container).getByText("Codexの変更・未確認")).toBeInTheDocument();
    const keep = within(view.container).getByRole("button", { name: "変更を保持" });
    const revert = within(view.container).getByRole("button", { name: "元に戻す" });
    expect(keep).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(revert);
    expect(onFinalize).not.toHaveBeenCalled();
    expect(revert).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(view.container).getByRole("button", { name: "差分を閉じる" }));
    expect(onFinalize).toHaveBeenCalledWith("revert");
  });
});

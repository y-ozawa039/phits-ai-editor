import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticReportDialog } from "./DiagnosticReportDialog";

afterEach(cleanup);

describe("DiagnosticReportDialog", () => {
  it("selects path redaction by default", () => {
    const onSave = vi.fn();
    render(<DiagnosticReportDialog onCancel={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole("radio", { name: /パスを伏せて保存/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "保存…" }));

    expect(onSave).toHaveBeenCalledWith(true);
  });

  it("allows an explicit unredacted save", () => {
    const onSave = vi.fn();
    render(<DiagnosticReportDialog onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("radio", { name: "パスを伏せずに保存 実際のフォルダー構成を残します。" }));
    fireEvent.click(screen.getByRole("button", { name: "保存…" }));

    expect(onSave).toHaveBeenCalledWith(false);
    expect(screen.getByText(/外部へ共有する場合は内容をよくご確認ください/)).toBeInTheDocument();
  });

  it("focuses the dialog and closes with Escape", () => {
    const onCancel = vi.fn();
    render(<DiagnosticReportDialog onCancel={onCancel} onSave={vi.fn()} />);

    expect(screen.getByRole("dialog")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

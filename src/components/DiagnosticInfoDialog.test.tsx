import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticInfoDialog } from "./DiagnosticInfoDialog";

afterEach(cleanup);

describe("DiagnosticInfoDialog", () => {
  it("shows the log location and diagnostic retention rules", () => {
    const openFolder = vi.fn();
    const copyPath = vi.fn();
    render(<DiagnosticInfoDialog
      startupLog="C:\\Users\\name\\AppData\\Roaming\\local.phits-ai-editor\\logs\\startup.log"
      onOpenLogFolder={openFolder}
      onCopyLogPath={copyPath}
      onClose={vi.fn()}
    />);

    expect(screen.getByText(/startup\.log/)).toBeInTheDocument();
    expect(screen.getByText(/256 KiB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ログフォルダーを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "起動ログのパスをコピー" }));
    expect(openFolder).toHaveBeenCalledTimes(1);
    expect(copyPath).toHaveBeenCalledTimes(1);
  });

  it("disables log actions when the path is unavailable", () => {
    render(<DiagnosticInfoDialog startupLog={null} onOpenLogFolder={vi.fn()} onCopyLogPath={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ログフォルダーを開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "起動ログのパスをコピー" })).toBeDisabled();
  });

  it("focuses the dialog and closes with Escape", () => {
    const onClose = vi.fn();
    render(<DiagnosticInfoDialog startupLog={null} onOpenLogFolder={vi.fn()} onCopyLogPath={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole("dialog")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

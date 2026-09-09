import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

afterEach(cleanup);

describe("UnsavedChangesDialog", () => {
  it("shows the file and exposes all three safe choices", () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();
    render(<UnsavedChangesDialog fileName="main.inp" busy={false} onCancel={onCancel} onDiscard={onDiscard} onSave={onSave}/>);

    expect(screen.getByRole("dialog", { name: "変更を保存しますか？" })).toBeInTheDocument();
    expect(screen.getByText("main.inp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    fireEvent.click(screen.getByRole("button", { name: "保存せず閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "保存して閉じる" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("locks every choice while saving", () => {
    render(<UnsavedChangesDialog fileName="main.inp" busy onCancel={vi.fn()} onDiscard={vi.fn()} onSave={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存せず閉じる" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  });
});

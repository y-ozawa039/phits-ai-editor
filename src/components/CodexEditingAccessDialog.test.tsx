import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodexEditingAccessDialog } from "./CodexEditingAccessDialog";

describe("CodexEditingAccessDialog", () => {
  it("states the model, approval mode, scope and narrow probe boundary", () => {
    const onConfirm = vi.fn();
    render(<CodexEditingAccessDialog
      mode="liveProbe"
      workspaceRoot="C:\\research"
      modelLabel="Model A"
      reasoning="low"
      busy={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />);
    expect(screen.getByText("Model A")).toBeInTheDocument();
    expect(screen.getByText(/一時テキストファイルを1つ作成/)).toBeInTheDocument();
    expect(screen.getByText(/一時ファイルは自動的に削除します/)).toBeInTheDocument();
    expect(screen.getByText(/一時ファイル変更だけを自動的に許可/)).toBeInTheDocument();
    expect(screen.getByText(/研究ファイルやPHITS計算には触れません/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "検査を開始" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("explains that the override only removes the Editor diagnostic gate", () => {
    render(<CodexEditingAccessDialog
      mode="override"
      workspaceRoot="C:\\research"
      modelLabel="Model A"
      reasoning="low"
      busy={false}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />);
    expect(screen.getByText(/エディタ側の制限だけ/)).toBeInTheDocument();
    expect(screen.getByText(/Sandbox、承認設定、ワークスペース境界、PHITS実行の検証は変更しません/)).toBeInTheDocument();
  });
});

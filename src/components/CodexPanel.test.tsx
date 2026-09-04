import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodexPanel } from "./CodexPanel";

const baseProps = {
  open: true,
  width: 360,
  connected: true,
  busy: false,
  models: [{ id: "model-a", displayName: "Model A", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: ["low", "medium"] }],
  model: "model-a",
  reasoning: "medium",
  threadId: "thread-1",
  messages: [],
  approval: null,
  onToggle: vi.fn(),
  onResizeStart: vi.fn(),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onModelChange: vi.fn(),
  onReasoningChange: vi.fn(),
  onNewThread: vi.fn(),
  onResumeThread: vi.fn(),
  onSend: vi.fn(),
  onInterrupt: vi.fn(),
  onApproval: vi.fn(),
};

describe("CodexPanel", () => {
  it("sends a trimmed message on Enter", () => {
    const onSend = vi.fn();
    render(<CodexPanel {...baseProps} onSend={onSend} />);
    const input = screen.getByPlaceholderText("Codexにメッセージを送信…");
    fireEvent.change(input, { target: { value: "  入力を確認して  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("入力を確認して");
  });

  it("shows approval details and resolves the decision", () => {
    const onApproval = vi.fn();
    render(<CodexPanel {...baseProps} approval={{ requestId: 7, method: "applyPatch", params: { path: "sample.inp" } }} onApproval={onApproval} />);
    expect(screen.getByText("承認が必要です")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "承認" }));
    expect(onApproval).toHaveBeenCalledWith("accept");
  });
});

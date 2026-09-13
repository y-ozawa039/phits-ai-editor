import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputPanel } from "./OutputPanel";

afterEach(cleanup);

const baseProps = {
  collapsed: false,
  height: 206,
  onToggle: vi.fn(),
  onClear: vi.fn(),
  onResizeStart: vi.fn(),
};

function setScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
}

describe("OutputPanel", () => {
  it("automatically follows newly appended output", () => {
    const { rerender } = render(<OutputPanel {...baseProps} lines={["first"]} />);
    const output = screen.getByRole("log");
    setScrollMetrics(output, 300, 100);

    rerender(<OutputPanel {...baseProps} lines={["first", "second"]} />);

    expect(output.scrollTop).toBe(300);
  });

  it("pauses following while the user reads older output and resumes at the bottom", () => {
    const { rerender } = render(<OutputPanel {...baseProps} lines={["first"]} />);
    const output = screen.getByRole("log");
    setScrollMetrics(output, 300, 100);
    output.scrollTop = 0;
    fireEvent.scroll(output);

    setScrollMetrics(output, 400, 100);
    rerender(<OutputPanel {...baseProps} lines={["first", "second"]} />);
    expect(output.scrollTop).toBe(0);

    output.scrollTop = 300;
    fireEvent.scroll(output);
    setScrollMetrics(output, 500, 100);
    rerender(<OutputPanel {...baseProps} lines={["first", "second", "third"]} />);
    expect(output.scrollTop).toBe(500);
  });
});

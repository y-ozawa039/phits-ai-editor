import { describe, expect, it, vi } from "vitest";
import { applyUndoableModelContent, runUndoableModelHistory } from "./editorHistory";

describe("editor history", () => {
  it("places one Codex replacement between explicit undo boundaries", () => {
    const calls: string[] = [];
    const model = {
      getValue: () => "before",
      getFullModelRange: () => ({ marker: "all" }),
      pushStackElement: () => { calls.push("boundary"); return true; },
      pushEditOperations: vi.fn((_cursor, edits) => {
        calls.push(`edit:${edits[0].text}`);
        return null;
      }),
    };

    expect(applyUndoableModelContent(model as never, "after")).toBe(true);
    expect(calls).toEqual(["boundary", "edit:after", "boundary"]);
  });

  it("does not create a history entry for identical content", () => {
    const pushStackElement = vi.fn();
    const model = { getValue: () => "same", pushStackElement };
    expect(applyUndoableModelContent(model as never, "same")).toBe(false);
    expect(pushStackElement).not.toHaveBeenCalled();
  });

  it("runs toolbar undo and redo directly against the retained Monaco model", async () => {
    let value = "after";
    let undoAvailable = true;
    let redoAvailable = false;
    const model = {
      getValue: () => value,
      canUndo: () => undoAvailable,
      canRedo: () => redoAvailable,
      undo: vi.fn(async () => {
        value = "before";
        undoAvailable = false;
        redoAvailable = true;
      }),
      redo: vi.fn(async () => {
        value = "after";
        undoAvailable = true;
        redoAvailable = false;
      }),
    };

    expect(await runUndoableModelHistory(model as never, "undo")).toBe("before");
    expect(model.undo).toHaveBeenCalledOnce();
    expect(await runUndoableModelHistory(model as never, "redo")).toBe("after");
    expect(model.redo).toHaveBeenCalledOnce();
  });

  it("does not invoke an unavailable history operation", async () => {
    const model = { getValue: () => "same", canUndo: () => false, canRedo: () => false, undo: vi.fn(), redo: vi.fn() };
    expect(await runUndoableModelHistory(model as never, "undo")).toBeNull();
    expect(model.undo).not.toHaveBeenCalled();
  });
});

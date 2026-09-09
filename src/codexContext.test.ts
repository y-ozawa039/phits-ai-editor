import { describe, expect, it } from "vitest";
import { boundedEditorContext, defaultContextOptions, EDITOR_CONTEXT_PREFIX, isEditorContextText, MAX_EDITOR_CONTEXT_BYTES, MAX_SELECTION_BYTES, serializeEditorContext, utf8Bytes, visibleHistoryText } from "./codexContext";
import type { EditorContextV1 } from "./types";

const base = (): EditorContextV1 => ({ version: 1, dirty: false, openDocumentPaths: ["main.inp"], diagnostics: [] });

describe("Codex Editor Context", () => {
  it("does not expose empty diagnostics as a default composer context", () => {
    expect(defaultContextOptions().diagnostics).toBe(false);
  });
  it("keeps the visible user message separate from context history", () => {
    const encoded = serializeEditorContext({ ...base(), activeDocumentPath: "main.inp" });
    expect(encoded.startsWith(EDITOR_CONTEXT_PREFIX)).toBe(true);
    expect(isEditorContextText(encoded)).toBe(true);
    expect(visibleHistoryText(["半径を変更して", encoded])).toBe("半径を変更して");
  });

  it("measures UTF-8 bytes and rejects oversized selection text", () => {
    expect(utf8Bytes("あ")).toBe(3);
    const context = boundedEditorContext({
      ...base(),
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2, text: "a".repeat(MAX_SELECTION_BYTES + 1) },
    });
    expect(context.selection).toBeUndefined();
    expect(context.contentWarning).toContain("64 KiB");
  });

  it("fails closed instead of truncating oversized dirty buffers", () => {
    const context = boundedEditorContext({ ...base(), dirty: true, dirtyBuffer: "あ".repeat(MAX_EDITOR_CONTEXT_BYTES) });
    expect(context.dirtyBuffer).toBeUndefined();
    expect(context.contentWarning).toContain("128 KiB");
  });
});

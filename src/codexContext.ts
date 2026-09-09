import type { CodexContextOptions, EditorContextV1 } from "./types";

export const EDITOR_CONTEXT_PREFIX = "PHITS_EDITOR_CONTEXT_V1\n";
export const MAX_EDITOR_CONTEXT_BYTES = 128 * 1024;
export const MAX_SELECTION_BYTES = 64 * 1024;

const encoder = new TextEncoder();

export function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

export function boundedEditorContext(context: EditorContextV1): EditorContextV1 {
  const next = { ...context };
  const selectionBytes = next.selection ? utf8Bytes(next.selection.text) : 0;
  if (selectionBytes > MAX_SELECTION_BYTES && next.selection) {
    next.selection = undefined;
    next.contentWarning = "選択範囲が64 KiBを超えたため本文を添付していません。範囲を小さくしてください。";
  }

  const withoutLargeText = { ...next, dirtyBuffer: undefined, attachedOutputContent: undefined };
  const baseBytes = utf8Bytes(JSON.stringify(withoutLargeText));
  const dirtyBytes = next.dirtyBuffer ? utf8Bytes(next.dirtyBuffer) : 0;
  const outputBytes = next.attachedOutputContent ? utf8Bytes(next.attachedOutputContent) : 0;
  if (baseBytes + dirtyBytes + outputBytes > MAX_EDITOR_CONTEXT_BYTES) {
    next.dirtyBuffer = undefined;
    next.attachedOutputContent = undefined;
    next.contentWarning = "Editor Contextが128 KiBを超えたため、未保存本文または出力本文を添付していません。";
  }
  return next;
}

export function serializeEditorContext(context: EditorContextV1): string {
  return `${EDITOR_CONTEXT_PREFIX}${JSON.stringify(boundedEditorContext(context))}`;
}

export function isEditorContextText(value: string): boolean {
  return value.startsWith(EDITOR_CONTEXT_PREFIX);
}

export function visibleHistoryText(parts: string[]): string {
  return parts.filter((part) => !isEditorContextText(part)).join("\n");
}

export function defaultContextOptions(): CodexContextOptions {
  // Diagnostics remain in the wire schema, but are opt-in until the editor has
  // a real diagnostic provider. Empty marker sets must not appear as a chip.
  return { activeDocument: true, selection: true, diagnostics: false, attachedOutput: true };
}

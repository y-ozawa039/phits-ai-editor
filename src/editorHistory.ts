import type { editor as MonacoEditor } from "monaco-editor";

export interface UndoableTextModel extends MonacoEditor.ITextModel {
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
}

export type EditorHistoryOperation = "undo" | "redo";

export function applyUndoableModelContent(model: MonacoEditor.ITextModel, content: string): boolean {
  if (model.getValue() === content) return false;
  model.pushStackElement();
  model.pushEditOperations(null, [{ range: model.getFullModelRange(), text: content, forceMoveMarkers: true }], () => null);
  model.pushStackElement();
  return true;
}

export function asUndoableTextModel(model: MonacoEditor.ITextModel): UndoableTextModel {
  return model as UndoableTextModel;
}

export async function runUndoableModelHistory(model: MonacoEditor.ITextModel, operation: EditorHistoryOperation): Promise<string | null> {
  const undoableModel = asUndoableTextModel(model);
  const available = operation === "undo" ? undoableModel.canUndo() : undoableModel.canRedo();
  if (!available) return null;
  await (operation === "undo" ? undoableModel.undo() : undoableModel.redo());
  return model.getValue();
}

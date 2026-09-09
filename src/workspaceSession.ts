export const WORKSPACE_SESSION_KEY = "phits-ai-editor.workspace-session.v1";

export interface WorkspaceSessionV1 {
  root: string;
  openDocumentPaths: string[];
  activeDocumentPath?: string;
  activeInputPath?: string;
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
  : [];

export function normalizeWorkspaceSession(value: unknown): WorkspaceSessionV1 | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.root !== "string" || !record.root) return null;
  return {
    root: record.root,
    openDocumentPaths: strings(record.openDocumentPaths),
    activeDocumentPath: typeof record.activeDocumentPath === "string" ? record.activeDocumentPath : undefined,
    activeInputPath: typeof record.activeInputPath === "string" ? record.activeInputPath : undefined,
  };
}

export function loadWorkspaceSession(storage: Pick<Storage, "getItem"> = localStorage): WorkspaceSessionV1 | null {
  try {
    const raw = storage.getItem(WORKSPACE_SESSION_KEY);
    return raw ? normalizeWorkspaceSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(
  session: WorkspaceSessionV1,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(normalizeWorkspaceSession(session)));
}

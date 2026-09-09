import { describe, expect, it } from "vitest";
import { loadWorkspaceSession, normalizeWorkspaceSession, saveWorkspaceSession, WORKSPACE_SESSION_KEY } from "./workspaceSession";

describe("workspace session", () => {
  it("normalizes paths and removes duplicate tabs", () => {
    expect(normalizeWorkspaceSession({
      root: "C:\\work",
      openDocumentPaths: ["main.inp", "main.inp", 42],
      activeDocumentPath: "main.inp",
      activeInputPath: "main.inp",
    })).toEqual({
      root: "C:\\work",
      openDocumentPaths: ["main.inp"],
      activeDocumentPath: "main.inp",
      activeInputPath: "main.inp",
    });
  });

  it("round trips valid state and ignores malformed data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const session = { root: "C:\\work", openDocumentPaths: ["a.inp"] };
    saveWorkspaceSession(session, storage);
    expect(values.has(WORKSPACE_SESSION_KEY)).toBe(true);
    expect(loadWorkspaceSession(storage)).toEqual(session);
    values.set(WORKSPACE_SESSION_KEY, "not-json");
    expect(loadWorkspaceSession(storage)).toBeNull();
  });
});

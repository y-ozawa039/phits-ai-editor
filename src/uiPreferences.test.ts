import { describe, expect, it, vi } from "vitest";
import { codexPanelWidth, DEFAULT_CODEX_PANEL_RATIO, DEFAULT_UI_PREFERENCES, FACTORY_FONT_SIZE_DEFAULTS, FONT_SIZE_DEFAULTS_KEY, FONT_SIZE_PRESETS, loadFontSizeDefaults, loadUiPreferences, MAX_FONT_SIZE, MIN_FONT_SIZE, normalizeCodexPanelRatio, normalizeFontSizeDefaults, normalizeUiPreferences, saveFontSizeDefaults, saveUiPreferences, UI_PREFERENCES_KEY } from "./uiPreferences";

describe("UI preferences", () => {
  it("loads defaults when storage is empty or malformed", () => {
    expect(loadUiPreferences({ getItem: () => null })).toEqual(DEFAULT_UI_PREFERENCES);
    expect(loadUiPreferences({ getItem: () => "not-json" })).toEqual(DEFAULT_UI_PREFERENCES);
    expect(DEFAULT_UI_PREFERENCES.explorerFontSize).toBe(14);
    expect(DEFAULT_UI_PREFERENCES.editorFontSize).toBe(14);
    expect(DEFAULT_UI_PREFERENCES.codexFontSize).toBe(14);
    expect(FONT_SIZE_PRESETS).toEqual([12, 14, 16, 18, 20, 24, 28]);
  });

  it("preserves visibility and clamps font sizes", () => {
    expect(normalizeUiPreferences({
      sidebarOpen: false,
      codexOpen: false,
      outputOpen: false,
      explorerFontSize: 3,
      editorFontSize: 99,
      codexFontSize: 99,
    })).toEqual({
      sidebarOpen: false,
      codexOpen: false,
      outputOpen: false,
      explorerFontSize: MIN_FONT_SIZE,
      editorFontSize: MAX_FONT_SIZE,
      codexFontSize: MAX_FONT_SIZE,
      codexPanelRatio: DEFAULT_CODEX_PANEL_RATIO,
      approvalMode: "confirmFirst",
    });
    expect(normalizeUiPreferences({ editorFontSize: 1 }).editorFontSize).toBe(MIN_FONT_SIZE);
  });

  it("migrates legacy visibility while applying the new 14 px defaults", () => {
    const legacy = JSON.stringify({ sidebarOpen: false, codexOpen: true, outputOpen: false, explorerFontSize: 12, editorFontSize: 22, codexFontSize: 12 });
    expect(loadUiPreferences({ getItem: (key) => key.endsWith(".v1") ? legacy : null })).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      sidebarOpen: false,
      codexOpen: true,
      outputOpen: false,
    });
  });

  it("writes a versioned preference record", () => {
    const setItem = vi.fn();
    saveUiPreferences({ ...DEFAULT_UI_PREFERENCES, editorFontSize: 17, codexFontSize: 15 }, { setItem });
    expect(setItem).toHaveBeenCalledWith(UI_PREFERENCES_KEY, expect.stringContaining('"editorFontSize":17'));
    expect(setItem).toHaveBeenCalledWith(UI_PREFERENCES_KEY, expect.stringContaining('"codexFontSize":15'));
  });

  it("keeps a safe global Codex approval mode", () => {
    expect(normalizeUiPreferences({ approvalMode: "onRequest" }).approvalMode).toBe("onRequest");
    expect(normalizeUiPreferences({ approvalMode: "never" }).approvalMode).toBe("confirmFirst");
  });

  it("uses one third by default and never lets the Codex panel exceed half the window", () => {
    expect(normalizeCodexPanelRatio(undefined)).toBe(DEFAULT_CODEX_PANEL_RATIO);
    expect(codexPanelWidth(1500, DEFAULT_CODEX_PANEL_RATIO)).toBe(500);
    expect(codexPanelWidth(1500, 0.9)).toBe(750);
    expect(codexPanelWidth(900, 0.2)).toBe(360);
  });

  it("loads and clamps app-wide font defaults independently of a workspace", () => {
    expect(loadFontSizeDefaults({ getItem: () => null })).toEqual(FACTORY_FONT_SIZE_DEFAULTS);
    expect(loadFontSizeDefaults({ getItem: () => "not-json" })).toEqual(FACTORY_FONT_SIZE_DEFAULTS);
    expect(normalizeFontSizeDefaults({ explorerFontSize: 8, editorFontSize: 19, codexFontSize: 40 })).toEqual({
      explorerFontSize: MIN_FONT_SIZE,
      editorFontSize: 19,
      codexFontSize: MAX_FONT_SIZE,
    });
  });

  it("stores the user-defined defaults under the global application key", () => {
    const setItem = vi.fn();
    saveFontSizeDefaults({ explorerFontSize: 15, editorFontSize: 17, codexFontSize: 16 }, { setItem });
    expect(setItem).toHaveBeenCalledWith(FONT_SIZE_DEFAULTS_KEY, JSON.stringify({ explorerFontSize: 15, editorFontSize: 17, codexFontSize: 16 }));
    expect(FONT_SIZE_DEFAULTS_KEY).toContain("global-font-defaults");
  });
});

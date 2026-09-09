export interface UiPreferences {
  sidebarOpen: boolean;
  codexOpen: boolean;
  outputOpen: boolean;
  explorerFontSize: number;
  editorFontSize: number;
  codexFontSize: number;
  codexPanelRatio: number;
  approvalMode: "confirmFirst" | "consultationOnly" | "onRequest";
}

export interface FontSizeDefaults {
  explorerFontSize: number;
  editorFontSize: number;
  codexFontSize: number;
}

export const UI_PREFERENCES_KEY = "phits-ai-editor.ui-preferences.v2";
export const FONT_SIZE_DEFAULTS_KEY = "phits-ai-editor.global-font-defaults.v1";
const LEGACY_UI_PREFERENCES_KEY = "phits-ai-editor.ui-preferences.v1";
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_CODEX_PANEL_RATIO = 1 / 3;
export const MAX_CODEX_PANEL_RATIO = 1 / 2;
export const MIN_CODEX_PANEL_WIDTH = 360;
export const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28] as const;
export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  sidebarOpen: true,
  codexOpen: true,
  outputOpen: true,
  explorerFontSize: 14,
  editorFontSize: 14,
  codexFontSize: 14,
  codexPanelRatio: DEFAULT_CODEX_PANEL_RATIO,
  approvalMode: "confirmFirst",
};
export const FACTORY_FONT_SIZE_DEFAULTS: FontSizeDefaults = {
  explorerFontSize: 14,
  editorFontSize: 14,
  codexFontSize: 14,
};

export function clampFontSize(value: unknown, fallback = DEFAULT_UI_PREFERENCES.editorFontSize): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
}

export function normalizeCodexPanelRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CODEX_PANEL_RATIO;
  return Math.max(0.2, Math.min(MAX_CODEX_PANEL_RATIO, value));
}

export function codexPanelWidth(viewportWidth: number, ratio: number): number {
  const safeViewport = Math.max(0, viewportWidth);
  const maximum = safeViewport * MAX_CODEX_PANEL_RATIO;
  return Math.round(Math.min(maximum, Math.max(MIN_CODEX_PANEL_WIDTH, safeViewport * normalizeCodexPanelRatio(ratio))));
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_UI_PREFERENCES };
  const source = value as Record<string, unknown>;
  return {
    sidebarOpen: typeof source.sidebarOpen === "boolean" ? source.sidebarOpen : DEFAULT_UI_PREFERENCES.sidebarOpen,
    codexOpen: typeof source.codexOpen === "boolean" ? source.codexOpen : DEFAULT_UI_PREFERENCES.codexOpen,
    outputOpen: typeof source.outputOpen === "boolean" ? source.outputOpen : DEFAULT_UI_PREFERENCES.outputOpen,
    explorerFontSize: clampFontSize(source.explorerFontSize, DEFAULT_UI_PREFERENCES.explorerFontSize),
    editorFontSize: clampFontSize(source.editorFontSize),
    codexFontSize: clampFontSize(source.codexFontSize, DEFAULT_UI_PREFERENCES.codexFontSize),
    codexPanelRatio: normalizeCodexPanelRatio(source.codexPanelRatio),
    approvalMode: source.approvalMode === "consultationOnly" || source.approvalMode === "onRequest" ? source.approvalMode : "confirmFirst",
  };
}

export function normalizeFontSizeDefaults(value: unknown): FontSizeDefaults {
  if (typeof value !== "object" || value === null) return { ...FACTORY_FONT_SIZE_DEFAULTS };
  const source = value as Record<string, unknown>;
  return {
    explorerFontSize: clampFontSize(source.explorerFontSize, FACTORY_FONT_SIZE_DEFAULTS.explorerFontSize),
    editorFontSize: clampFontSize(source.editorFontSize, FACTORY_FONT_SIZE_DEFAULTS.editorFontSize),
    codexFontSize: clampFontSize(source.codexFontSize, FACTORY_FONT_SIZE_DEFAULTS.codexFontSize),
  };
}

export function loadUiPreferences(storage: Pick<Storage, "getItem"> = window.localStorage): UiPreferences {
  try {
    const stored = storage.getItem(UI_PREFERENCES_KEY);
    if (stored) return normalizeUiPreferences(JSON.parse(stored));

    const legacy = storage.getItem(LEGACY_UI_PREFERENCES_KEY);
    if (!legacy) return { ...DEFAULT_UI_PREFERENCES };
    const source = JSON.parse(legacy) as Record<string, unknown>;
    return {
      ...DEFAULT_UI_PREFERENCES,
      sidebarOpen: typeof source.sidebarOpen === "boolean" ? source.sidebarOpen : DEFAULT_UI_PREFERENCES.sidebarOpen,
      codexOpen: typeof source.codexOpen === "boolean" ? source.codexOpen : DEFAULT_UI_PREFERENCES.codexOpen,
      outputOpen: typeof source.outputOpen === "boolean" ? source.outputOpen : DEFAULT_UI_PREFERENCES.outputOpen,
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function saveUiPreferences(preferences: UiPreferences, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(normalizeUiPreferences(preferences)));
  } catch {
    // A storage failure must not prevent editing or PHITS execution.
  }
}

export function loadFontSizeDefaults(storage: Pick<Storage, "getItem"> = window.localStorage): FontSizeDefaults {
  try {
    const stored = storage.getItem(FONT_SIZE_DEFAULTS_KEY);
    return stored ? normalizeFontSizeDefaults(JSON.parse(stored)) : { ...FACTORY_FONT_SIZE_DEFAULTS };
  } catch {
    return { ...FACTORY_FONT_SIZE_DEFAULTS };
  }
}

export function saveFontSizeDefaults(defaults: FontSizeDefaults, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(FONT_SIZE_DEFAULTS_KEY, JSON.stringify(normalizeFontSizeDefaults(defaults)));
  } catch {
    // A storage failure must not prevent editing or PHITS execution.
  }
}

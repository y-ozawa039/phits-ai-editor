import type * as Monaco from "monaco-editor";

export const PHITS_LANGUAGE_ID = "phits";

export interface PhitsSectionSpec {
  name: string;
  descriptionJa?: string;
  descriptionEn?: string;
}

export interface PhitsEntrySpec {
  name: string;
  kind: string;
  validSections: string[];
  descriptionJa?: string;
  descriptionEn?: string;
  defaultValue?: string;
  valueType?: string;
  unit?: string;
  allowedValues?: string[];
}

export interface NormalizedPhitsSpec {
  sections: PhitsSectionSpec[];
  entries: PhitsEntrySpec[];
}

export interface PhitsSectionRange {
  name: string;
  startLine: number;
  endLine: number;
}

/** PHITS 3.37 Japanese manual, tables 4.1.1 and 4.1.2 (including the t-star legacy name). */
export const PHITS_MANUAL_SECTIONS = [
  "[title]",
  "[parameters]",
  "[source]",
  "[material]",
  "[surface]",
  "[cell]",
  "[transform]",
  "[temperature]",
  "[mat time change]",
  "[magnetic field]",
  "[electro magnetic field]",
  "[delta ray]",
  "[track structure]",
  "[super mirror]",
  "[elastic option]",
  "[data max]",
  "[frag data]",
  "[importance]",
  "[weight window]",
  "[ww bias]",
  "[forced collisions]",
  "[Repeated collisions]",
  "[volume]",
  "[multiplier]",
  "[mat name color]",
  "[reg name]",
  "[counter]",
  "[timer]",
  "[user defined interaction]",
  "[user defined particle]",
  "[libout]",
  "[end]",
  "[t-track]",
  "[t-cross]",
  "[t-point]",
  "[t-deposit]",
  "[t-deposit2]",
  "[t-heat]",
  "[t-yield]",
  "[t-product]",
  "[t-dpa]",
  "[t-let]",
  "[t-sed]",
  "[t-time]",
  "[t-interact]",
  "[t-star]",
  "[t-dchain]",
  "[t-wwg]",
  "[t-wwbg]",
  "[t-volume]",
  "[t-userdefined]",
  "[t-gshow]",
  "[t-rshow]",
  "[t-3dshow]",
  "[T-4Dtrack]",
] as const;

const fallbackSections = [...PHITS_MANUAL_SECTIONS];
const manualSectionNames = new Set(PHITS_MANUAL_SECTIONS.map(normalizeSectionName));

const fallbackEntries = [
  ["icntl", "parameters"], ["maxcas", "parameters"], ["maxbch", "parameters"],
  ["file", "t-track"], ["mesh", "t-track"], ["unit", "t-track"], ["axis", "t-track"],
  ["proj", "source"], ["s-type", "source"], ["e0", "source"],
] as const;

export const fallbackPhitsSpec: NormalizedPhitsSpec = {
  sections: fallbackSections.map((name) => ({ name })),
  entries: fallbackEntries.map(([name, section]) => ({ name, kind: "parameter", validSections: [section] })),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Converts the generated workbench JSON format to a small editor-facing shape. */
export function normalizePhitsSpec(raw: unknown): NormalizedPhitsSpec {
  const root = asRecord(raw);
  if (!root) return fallbackPhitsSpec;

  const sections = (Array.isArray(root.sections) ? root.sections : []).flatMap((item): PhitsSectionSpec[] => {
    const value = asRecord(item);
    if (!value || typeof value.name !== "string") return [];
    return [{
      name: value.name,
      descriptionJa: typeof value.description_ja === "string" ? value.description_ja : undefined,
      descriptionEn: typeof value.description_en === "string" ? value.description_en : undefined,
    }];
  });

  const entries = (Array.isArray(root.entries) ? root.entries : []).flatMap((item): PhitsEntrySpec[] => {
    const value = asRecord(item);
    if (!value || typeof value.name !== "string") return [];
    return [{
      name: value.name,
      kind: typeof value.kind === "string" ? value.kind : "parameter",
      validSections: strings(value.validSections).map(normalizeSectionName),
      descriptionJa: typeof value.description_ja === "string" ? value.description_ja : undefined,
      descriptionEn: typeof value.description_en === "string" ? value.description_en : undefined,
      defaultValue: typeof value.default === "string" || typeof value.default === "number" ? String(value.default) : undefined,
      valueType: typeof value.valueType === "string" ? value.valueType : undefined,
      unit: typeof value.unit === "string" ? value.unit : undefined,
      allowedValues: strings(value.allowedValues),
    }];
  });

  return {
    sections: sections.length ? sections : fallbackPhitsSpec.sections,
    entries: entries.length ? entries : fallbackPhitsSpec.entries,
  };
}

export function normalizeSectionName(name: string): string {
  return name.replace(/^\s*\[\s*|\s*\]\s*$/g, "").replace(/\s+/g, "").toLowerCase();
}

export function sectionAtLine(text: string, lineNumber: number): string | null {
  const lines = text.split(/\r?\n/);
  for (let index = Math.min(lineNumber - 1, lines.length - 1); index >= 0; index -= 1) {
    const match = lines[index]?.match(/^\s*\[\s*([^\]]+)\s*\]/);
    if (match) return normalizeSectionName(match[1]);
  }
  return null;
}

/** Returns top-level PHITS section ranges for outline and sticky-scroll support. */
export function phitsSectionRanges(text: string): PhitsSectionRange[] {
  const lines = text.split(/\r?\n/);
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^ {0,4}(\[\s*[^\]]+?\s*\])/);
    return match && manualSectionNames.has(normalizeSectionName(match[1]))
      ? [{ name: match[1].trim(), startLine: index + 1 }]
      : [];
  });
  return headings.map((heading, index) => ({
    ...heading,
    endLine: headings[index + 1]?.startLine ? headings[index + 1].startLine - 1 : lines.length,
  }));
}

function entryDocumentation(entry: PhitsEntrySpec): string {
  const parts = [entry.descriptionJa, entry.descriptionEn];
  const attributes = [
    entry.defaultValue ? `既定値: ${entry.defaultValue}` : "",
    entry.valueType ? `型: ${entry.valueType}` : "",
    entry.unit ? `単位: ${entry.unit}` : "",
    entry.allowedValues?.length ? `許容値: ${entry.allowedValues.join(", ")}` : "",
  ].filter(Boolean).join(" / ");
  if (attributes) parts.push(attributes);
  return parts.filter(Boolean).join("\n\n");
}

let languageRegistered = false;

/** Registers PHITS highlighting, completion, and hover. Safe to call again with a newer spec. */
export function registerPhitsLanguage(monaco: typeof Monaco, rawSpec?: unknown): Monaco.IDisposable {
  const spec = rawSpec === undefined ? fallbackPhitsSpec : normalizePhitsSpec(rawSpec);
  if (!languageRegistered) {
    monaco.languages.register({ id: PHITS_LANGUAGE_ID, extensions: [".inp", ".pht"], aliases: ["PHITS"] });
    monaco.languages.setLanguageConfiguration(PHITS_LANGUAGE_ID, {
      comments: { lineComment: "$" },
      brackets: [["[", "]"], ["{", "}"], ["(", ")"]],
      autoClosingPairs: [{ open: "[", close: "]" }, { open: "(", close: ")" }, { open: "{", close: "}" }],
    });
    monaco.languages.setMonarchTokensProvider(PHITS_LANGUAGE_ID, {
      ignoreCase: true,
      tokenizer: {
        root: [
          [/^\s*\[[^\]]+\]/, "type.identifier"],
          [/^\s*(?:[$#!]).*$/, "comment"],
          [/(^|\s)[$#!].*$/, "comment"],
          [/\b(?:on|off|all|none)\b/i, "keyword"],
          [/[a-zA-Z][\w-]*(?=\s*=)/, "attribute.name"],
          [/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?/, "number"],
          [/"[^"\r\n]*"|'[^'\r\n]*'/, "string"],
        ],
      },
    });
    languageRegistered = true;
  }

  const completion = monaco.languages.registerCompletionItemProvider(PHITS_LANGUAGE_ID, {
    triggerCharacters: ["[", "="],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const currentSection = sectionAtLine(model.getValue(), position.lineNumber);
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const sectionMode = /^\s*\[?[^\]]*$/.test(linePrefix) && linePrefix.includes("[");
      const suggestions: Monaco.languages.CompletionItem[] = sectionMode
        ? spec.sections.map((section) => ({
            label: section.name,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: section.name,
            range,
            documentation: [section.descriptionJa, section.descriptionEn].filter(Boolean).join("\n\n"),
          }))
        : spec.entries
            .filter((entry) => !entry.validSections.length || !currentSection || entry.validSections.includes(currentSection))
            .map((entry) => ({
              label: entry.name,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${entry.name} = ${entry.defaultValue ?? ""}`.trimEnd(),
              filterText: entry.name,
              range,
              detail: [entry.kind, entry.valueType, entry.unit].filter(Boolean).join(" · "),
              documentation: entryDocumentation(entry),
            }));
      return { suggestions };
    },
  });

  const hover = monaco.languages.registerHoverProvider(PHITS_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const currentSection = sectionAtLine(model.getValue(), position.lineNumber);
      const entry = spec.entries.find((candidate) => candidate.name.toLowerCase() === word.word.toLowerCase()
        && (!candidate.validSections.length || !currentSection || candidate.validSections.includes(currentSection)));
      if (!entry) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `**${entry.name}**` }, { value: entryDocumentation(entry) || "PHITS parameter" }],
      };
    },
  });

  const outline = monaco.languages.registerDocumentSymbolProvider(PHITS_LANGUAGE_ID, {
    provideDocumentSymbols(model) {
      return phitsSectionRanges(model.getValue()).map((section) => ({
        name: section.name,
        detail: "PHITS section",
        kind: monaco.languages.SymbolKind.Module,
        tags: [],
        range: new monaco.Range(section.startLine, 1, section.endLine, model.getLineMaxColumn(section.endLine)),
        selectionRange: new monaco.Range(section.startLine, 1, section.startLine, model.getLineMaxColumn(section.startLine)),
      }));
    },
  });

  return { dispose: () => { completion.dispose(); hover.dispose(); outline.dispose(); } };
}

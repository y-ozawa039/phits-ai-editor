import { describe, expect, it } from "vitest";
import { fallbackPhitsSpec, normalizePhitsSpec, normalizeSectionName, sectionAtLine } from "./phitsLanguage";

describe("PHITS language specification", () => {
  it("normalizes generated workbench fields", () => {
    const result = normalizePhitsSpec({
      sections: [{ name: "[ Parameters ]", description_ja: "全体設定", description_en: "Global settings" }],
      entries: [{
        name: "maxcas",
        kind: "parameter",
        validSections: ["Parameters"],
        valueType: "int",
        default: "10",
        unit: "histories",
        allowedValues: ["1", "10"],
        description_ja: "ヒストリー数",
      }],
    });

    expect(result.sections[0]).toEqual({ name: "[ Parameters ]", descriptionJa: "全体設定", descriptionEn: "Global settings" });
    expect(result.entries[0]).toMatchObject({
      name: "maxcas",
      validSections: ["parameters"],
      valueType: "int",
      defaultValue: "10",
      unit: "histories",
      allowedValues: ["1", "10"],
    });
  });

  it("falls back for missing or malformed data", () => {
    expect(normalizePhitsSpec(null)).toBe(fallbackPhitsSpec);
    expect(normalizePhitsSpec({ sections: [], entries: [] }).sections.length).toBeGreaterThan(5);
    expect(normalizePhitsSpec({ sections: [], entries: [] }).entries.some((entry) => entry.name === "icntl")).toBe(true);
  });

  it("finds the active section case-insensitively", () => {
    const text = "[ Parameters ]\nmaxcas = 10\n\n[ T-Track ]\nmesh = reg";
    expect(sectionAtLine(text, 2)).toBe("parameters");
    expect(sectionAtLine(text, 5)).toBe("t-track");
    expect(normalizeSectionName(" [ SOURCE ] ")).toBe("source");
  });
});

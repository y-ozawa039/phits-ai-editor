import { describe, expect, it } from "vitest";
import { fallbackPhitsSpec, normalizePhitsSpec, normalizeSectionName, PHITS_MANUAL_SECTIONS, phitsSectionRanges, sectionAtLine } from "./phitsLanguage";

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

  it("maps every PHITS section to an outline range for sticky scrolling", () => {
    const text = "[ P a r a m e t e r s ]\nmaxcas = 10\n\n[ Source ]\nproj = photon\n[ Material ]\nmat[1] H 2 O 1\n[not a PHITS section]\nignored";
    expect(phitsSectionRanges(text)).toEqual([
      { name: "[ P a r a m e t e r s ]", startLine: 1, endLine: 3 },
      { name: "[ Source ]", startLine: 4, endLine: 5 },
      { name: "[ Material ]", startLine: 6, endLine: 9 },
    ]);
  });

  it("uses all 55 section names enumerated by manual tables 4.1.1 and 4.1.2", () => {
    expect(PHITS_MANUAL_SECTIONS).toHaveLength(55);
    expect(PHITS_MANUAL_SECTIONS).toContain("[material]");
    expect(PHITS_MANUAL_SECTIONS).toContain("[t-interact]");
    expect(PHITS_MANUAL_SECTIONS).toContain("[t-star]");
    expect(PHITS_MANUAL_SECTIONS).toContain("[T-4Dtrack]");
  });

  it("follows the manual's four-leading-space limit for section headers", () => {
    expect(phitsSectionRanges("    [material]\nmat[1] H 2 O 1")).toHaveLength(1);
    expect(phitsSectionRanges("     [material]\nmat[1] H 2 O 1")).toHaveLength(0);
  });
});

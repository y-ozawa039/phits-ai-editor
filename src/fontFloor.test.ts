import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8");

describe("application font floor", () => {
  it("contains no application-owned px font declaration below 12 px", () => {
    const sizes = Array.from(css.matchAll(/(?:font-size\s*:|font\s*:)[^;{}]*?(\d+(?:\.\d+)?)px/g), (match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((size) => size < 12)).toEqual([]);
  });

  it("uses pure black only for the requested high-contrast text areas", () => {
    expect(css).not.toMatch(/\.app-shell,\s*\.app-shell \*/);
    for (const selector of [
      ".menu-bar > details > summary",
      ".toolbar .tool-button > span",
      ".explorer-panel .panel-title",
      ".editor-tab > span:nth-child(2)",
      ".file-item > span",
      ".workspace-empty strong",
      ".codex-empty strong",
    ]) expect(css).toContain(selector);
    expect(css).toMatch(/\.codex-empty strong\s*\{\s*color:\s*#000000 !important;/);
  });

  it("uses neutral chrome without filtering semantic or editor colors", () => {
    expect(css).not.toMatch(/filter:\s*grayscale/);
    expect(css).toMatch(/\/\* Neutral application chrome\.[^]*\.status-bar\s*\{[^}]*background:\s*#505050;/);
  });

  it("renders the shrink A smaller than the grow A", () => {
    expect(css).toContain(".menu-settings .font-grow-button > span { font-size: 17px; }");
    expect(css).toContain(".menu-settings .font-shrink-button > span { font-size: 14px; }");
  });
});

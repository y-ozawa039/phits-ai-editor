import { describe, expect, it } from "vitest";
import { closeTopMenus } from "./topMenu";

function menuBar() {
  const nav = document.createElement("nav");
  nav.innerHTML = "<details open></details><details open></details><details open></details>";
  return nav;
}

describe("top menu behavior", () => {
  it("keeps only the newly opened menu visible", () => {
    const nav = menuBar();
    const menus = Array.from(nav.querySelectorAll("details"));

    closeTopMenus(nav, menus[1]);

    expect(menus.map((menu) => menu.open)).toEqual([false, true, false]);
  });

  it("closes every menu for outside clicks and Escape", () => {
    const nav = menuBar();
    const menus = Array.from(nav.querySelectorAll("details"));

    closeTopMenus(nav);

    expect(menus.every((menu) => !menu.open)).toBe(true);
  });
});

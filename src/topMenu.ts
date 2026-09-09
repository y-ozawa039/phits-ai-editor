export function closeTopMenus(menuBar: HTMLElement | null, except?: HTMLDetailsElement) {
  if (!menuBar) return;
  for (const menu of Array.from(menuBar.querySelectorAll<HTMLDetailsElement>(":scope > details[open]"))) {
    if (menu !== except) menu.open = false;
  }
}

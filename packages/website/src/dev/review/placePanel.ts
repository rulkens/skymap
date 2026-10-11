const MIN_WIDTH = 240;
const GAP = 16;
const WIDE = 900;

/**
 * Puts the panel in the strip right of the page's "on this page" list when the window
 * has one, so it covers none of the page's own columns; otherwise the stylesheet's
 * placement stands (a sheet at the foot of a phone, a box at the right edge between).
 */
export function placePanel(panel: HTMLElement): void {
  const rect = innerWidth > WIDE ? document.querySelector('.toc')?.getBoundingClientRect() : null;
  const left = rect ? rect.right + GAP : 0;
  const width = innerWidth - left - GAP;
  if (rect && rect.width > 0 && width >= MIN_WIDTH) {
    panel.style.cssText = `left:${left}px;right:auto;width:${width}px`;
  } else {
    panel.style.cssText = '';
  }
}

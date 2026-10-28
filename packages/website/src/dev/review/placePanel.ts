import type { CSSProperties } from 'react';

const MIN_WIDTH = 240;
const GAP = 16;
const WIDE = 900;

/**
 * Where the panel goes in the strip right of the page's "on this page" list when the window
 * has one, so it covers none of the page's own columns; otherwise the stylesheet's
 * placement stands (a sheet at the foot of a phone, a box at the right edge between).
 */
export function placePanel(): CSSProperties | undefined {
  const toc =
    innerWidth > WIDE
      ? document.querySelector('nav[aria-labelledby="toc-label"]')?.getBoundingClientRect()
      : null;
  const left = toc ? toc.right + GAP : 0;
  const width = innerWidth - left - GAP;
  if (toc && toc.width > 0 && width >= MIN_WIDTH) return { left, right: 'auto', width };
  return undefined;
}

import { OVERLAY_UI } from '../overlay/overlayUi';
import { isShown } from './isShown';

/**
 * elementsFromPoint skips text that lets the pointer through (the flight's captions), and the captions of
 * every stop share one corner at opacity 0, so the one that is showing is found by its box instead.
 */
export function clickThroughText(x: number, y: number): Element | undefined {
  return [...document.querySelectorAll('p, h1, h2, h3, small, figcaption')].find((el) => {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom || el.closest(OVERLAY_UI))
      return false;
    return getComputedStyle(el).pointerEvents === 'none' && isShown(el);
  });
}

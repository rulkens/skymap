import { OVERLAY_UI } from '../overlay/overlayUi';

/** Whether `el` is visible to the eye: no ancestor hides it, or fades it to near nothing. */
const isShown = (el: Element): boolean => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.3)
      return false;
  }
  return true;
};

// elementsFromPoint skips text that lets the pointer through (the flight's captions), and the captions of
// every stop share one corner at opacity 0, so the one that is showing is found by its box instead.
const clickThroughText = (x: number, y: number): Element | undefined =>
  [...document.querySelectorAll('p, h1, h2, h3, small, figcaption')].find((el) => {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom || el.closest(OVERLAY_UI))
      return false;
    return getComputedStyle(el).pointerEvents === 'none' && isShown(el);
  });

/** The page element under a viewport point, never the overlay's own. */
export function pickElement(x: number, y: number): Element {
  return (
    clickThroughText(x, y) ??
    document.elementsFromPoint(x, y).find((node) => !node.closest(OVERLAY_UI)) ??
    document.body
  );
}

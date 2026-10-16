import { OVERLAY_UI } from '../overlay/overlayUi';
import { clickThroughText } from './clickThroughText';

/** The page element under a viewport point, never the overlay's own. */
export function pickElement(x: number, y: number): Element {
  return (
    clickThroughText(x, y) ??
    document.elementsFromPoint(x, y).find((node) => !node.closest(OVERLAY_UI)) ??
    document.body
  );
}

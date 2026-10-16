import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';

/** A viewport rectangle in page coordinates, which is what a note keeps. */
export function pageRect(r: DOMRect | FeedbackRect): FeedbackRect {
  return {
    x: Math.round(r.x + scrollX),
    y: Math.round(r.y + scrollY),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

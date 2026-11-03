import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';
import type { FeedbackPoint } from './@types/FeedbackPoint';

/** The rectangle with `a` and `b` for opposite corners. */
export function spanRect(a: FeedbackPoint, b: FeedbackPoint): FeedbackRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

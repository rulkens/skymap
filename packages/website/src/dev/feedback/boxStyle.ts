import type { CSSProperties } from 'react';

import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';

/** The style that puts a box over `r`; the coordinates are the rectangle's, so they cannot be a class. */
export const boxStyle = (r: FeedbackRect): CSSProperties => ({
  left: r.x,
  top: r.y,
  width: r.width,
  height: r.height,
});

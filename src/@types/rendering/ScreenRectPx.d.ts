/**
 * ScreenRectPx — an axis-aligned rectangle in DEVICE pixels with +Y DOWN, the
 * frame `forwardProjectPoint`'s `screenX`/`screenY` produce and the label
 * bbox's atlas-Y agrees with. `x1`/`y1` are the max corner.
 */
export type ScreenRectPx = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

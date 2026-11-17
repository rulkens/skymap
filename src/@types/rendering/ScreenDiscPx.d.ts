import type { Vec2 } from '../math/Vec2';

/** A disc on the canvas, device px. */
export type ScreenDiscPx = {
  readonly centre: Vec2;
  readonly radius: number;
};

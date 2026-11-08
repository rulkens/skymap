import type { Vec2 } from '../math/Vec2';

/** A body's disc on screen, as the antique declutter keeps names behind it off it. */
export type ScreenBodyDisc = {
  /** The index of the body's own label, which the disc never blocks. */
  readonly index: number;
  readonly centre: Vec2;
  readonly radius: number;
  /** The body centre's distance, in the units of `Label2D.occludeNearKm`. */
  readonly centreKm: number;
  /** A ring's outline on screen (device px), in order round the ring. */
  readonly ring?: readonly Vec2[];
};

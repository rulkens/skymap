import type { Vec2 } from '../../math/Vec2';

/** A `PickWindow` as a canvas-NDC rectangle, y up. */
export type PickWindowNdc = {
  readonly centre: Vec2;
  readonly halfExtent: Vec2;
};

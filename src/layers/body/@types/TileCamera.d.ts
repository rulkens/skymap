import type { Vec2 } from '../../../@types/math/Vec2';

/**
 * One view as the surface-tile walk sees it: the body-local f64 view-projection
 * (unit sphere scaled to the datum, eye at the origin) and THAT view's own target
 * size. Only the x, y and w rows of `viewProjLocal` are read, so its depth band
 * is free. `Float64Array` on purpose: a caller that narrows too early is caught.
 */
export type TileCamera = {
  readonly viewProjLocal: Float64Array;
  readonly viewportPx: Readonly<Vec2>;
};

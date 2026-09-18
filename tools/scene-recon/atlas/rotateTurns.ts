import type { Vec2 } from '../../../src/@types/math/Vec2';

export type Turns = 0 | 1 | 2 | 3;

/** CCW rotation by `turns` × 90°: `R(1)·(x, y) = (−y, x)`. The one convention `chartPlacements`
 *  (forward, source → dest) and `rasterizeCharts` (inverted via `(4 − turns) % 4`) must agree on. */
export function rotateTurns([x, y]: Vec2, turns: Turns): Vec2 {
  switch (turns) {
    case 0:
      return [x, y];
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    default:
      return [y, -x];
  }
}

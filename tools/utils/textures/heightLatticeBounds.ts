import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { heightLatticeStepDeg } from './heightLatticeStepDeg';

/** The lon/lat box spanned by the `nx × ny` lattice posts starting at
 *  `(i0, j0)` on level `z` — posts, not cells, so the box's edges ARE the
 *  outermost posts. */
export function heightLatticeBounds(
  z: number,
  i0: number,
  j0: number,
  nx: number,
  ny: number,
): LonLatBounds {
  const step = heightLatticeStepDeg(z);
  return {
    west: -180 + i0 * step,
    east: -180 + (i0 + nx - 1) * step,
    north: 90 - j0 * step,
    south: 90 - (j0 + ny - 1) * step,
  };
}

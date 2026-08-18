import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { boxHalfExtentMpc } from './boxHalfExtentMpc';

/**
 * World Mpc -> "box-local": origin at the box's own (0,0,0) corner, range
 * [0, sizeMpc] per axis — the frame worldToVoxel already returns pre-scale.
 * `R` is identity at this task (GridBox has no `rotation` field yet); F2.3
 * fills in R⁻¹ here (see the design spec's transform-pair section).
 */
export function worldToBoxLocal(box: GridBox, p: Readonly<Vec3>): Vec3 {
  const half = boxHalfExtentMpc(box.sizeMpc);
  return [
    p[0] - box.centerMpc[0] + half[0],
    p[1] - box.centerMpc[1] + half[1],
    p[2] - box.centerMpc[2] + half[2],
  ];
}

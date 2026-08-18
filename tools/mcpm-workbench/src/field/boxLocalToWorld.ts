import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { boxHalfExtentMpc } from './boxHalfExtentMpc';

/**
 * Box-local -> world Mpc, the exact inverse of worldToBoxLocal. `R` is
 * identity at this task; F2.3 fills in R here to match.
 */
export function boxLocalToWorld(box: GridBox, q: Readonly<Vec3>): Vec3 {
  const half = boxHalfExtentMpc(box.sizeMpc);
  return [
    q[0] - half[0] + box.centerMpc[0],
    q[1] - half[1] + box.centerMpc[1],
    q[2] - half[2] + box.centerMpc[2],
  ];
}

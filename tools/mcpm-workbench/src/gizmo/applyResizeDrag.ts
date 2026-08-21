import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';

/** Full-extent floor — a handle dragged through the box must not invert or zero it. */
export const MIN_SIZE_MPC = 1;

/**
 * applyResizeDrag — grows/shrinks `sizeMpc[axis]` by `sign · deltaMpc`, anchoring the opposite
 * face (`centerMpc − sign · half · axisDir`, unaffected by the drag). Derived by re-deriving
 * `centerMpc` from that fixed anchor and the new half-extent every call — `anchor + sign ·
 * newHalf · axisDir` — rather than offsetting the old `centerMpc` by `sign · deltaMpc / 2`: the
 * two agree at `sign = 1` but only the anchor-relative form keeps the opposite face exactly fixed
 * at `sign = -1` too (the offset form drifts the wrong face by `deltaMpc`), and it makes the
 * floor a one-line clamp on `newHalf` with the anchor still exact, not a second branch.
 */
export function applyResizeDrag(
  box: GridBox,
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  sign: 1 | -1,
  deltaMpc: number,
): { readonly centerMpc: Vec3; readonly sizeMpc: Vec3 } {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const anchor: Vec3 = [
    box.centerMpc[0] - sign * half[axis] * axisDir[0],
    box.centerMpc[1] - sign * half[axis] * axisDir[1],
    box.centerMpc[2] - sign * half[axis] * axisDir[2],
  ];

  const newHalf = Math.max(half[axis] + (sign * deltaMpc) / 2, MIN_SIZE_MPC / 2);

  const centerMpc: Vec3 = [
    anchor[0] + sign * newHalf * axisDir[0],
    anchor[1] + sign * newHalf * axisDir[1],
    anchor[2] + sign * newHalf * axisDir[2],
  ];
  const sizeMpc: Vec3 = [box.sizeMpc[0], box.sizeMpc[1], box.sizeMpc[2]];
  sizeMpc[axis] = newHalf * 2;

  return { centerMpc, sizeMpc };
}

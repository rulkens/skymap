import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

/** A unit vector ⊥ `axisDir` — the rotate ring's 0°-angle reference for `dragRotate`. Same
 *  "helper axis not near-parallel" fallback as cameraBasis.ts's right/up derivation and
 *  boxPreviewPass.ts's crossArmVectors — deterministic in axisDir alone, so calling it fresh at
 *  pointer-down and every pointer-move yields the SAME reference `dragRotate`'s absolute-angle
 *  anchor/current pair needs, with no state to carry between calls. */
export function ringReferenceDirFor(axisDir: Readonly<Vec3>): Vec3 {
  const helper: Vec3 = Math.abs(axisDir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  return normalize3(cross3(axisDir, helper));
}

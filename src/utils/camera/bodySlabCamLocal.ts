/**
 * bodySlabCamLocal — `camPosLocal`'s job reduced to a pure division: the seam
 * already subtracted the body centre and rotated the offset into the body's
 * fixed axes, so only the per-axis metre-radius divide is left. Every
 * body-slab row draws a true sphere (oblate bodies stay on `composeBodyMvp`/
 * `camPosLocal` in NEAR0 — famous stars, per that module's header), so unlike
 * its Mpc-side sibling this util carries no oblateness parameter.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** eyeRelBodyM ÷ the body's metre radius → the unit-sphere frame. */
export function bodySlabCamLocal(eyeRelBodyM: Readonly<Vec3>, radiusM: number): Vec3 {
  return [eyeRelBodyM[0] / radiusM, eyeRelBodyM[1] / radiusM, eyeRelBodyM[2] / radiusM];
}

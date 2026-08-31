/**
 * bodySlabCamLocal — `camPosLocal`'s job reduced to a pure division: the seam
 * already subtracted the body centre and rotated the offset into the body's
 * fixed axes, so only the per-axis metre-radius divide is left. Matches
 * `camPosLocal`'s oblateness convention exactly (its header) — polar = local-Z.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** eyeRelBodyM ÷ the body's per-axis metre radii → the unit-sphere frame. */
export function bodySlabCamLocal(
  eyeRelBodyM: Readonly<Vec3>,
  radiusM: number,
  oblateness = 0,
): Vec3 {
  const equatorialM = radiusM;
  const polarM = radiusM * Math.max(1 - oblateness, Number.EPSILON);
  return [eyeRelBodyM[0] / equatorialM, eyeRelBodyM[1] / equatorialM, eyeRelBodyM[2] / polarM];
}

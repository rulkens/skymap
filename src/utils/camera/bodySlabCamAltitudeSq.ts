/**
 * bodySlabCamAltitudeSq — `dot(camPosLocal, camPosLocal) − 1`, the constant term
 * of the analytic sphere's ray quadratic, computed in f64.
 *
 * The shader cannot form it: `camPosLocal` is f32, and 10 m above Mars its
 * components are 1 + 3e−6, where one ulp is already 0.4 m — subtracting 1 there
 * quantises the eye's altitude before the quadratic runs. The altitude form
 * below has only one subtraction, `|eyeRelBodyM| − radiusM`, between two f64
 * metre quantities, so the result is good to nanometres.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** (h/R)·(2 + h/R) for h = |eyeRelBodyM| − radiusM — dimensionless, 0 at the surface. */
export function bodySlabCamAltitudeSq(eyeRelBodyM: Readonly<Vec3>, radiusM: number): number {
  const lenM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  const altitudeRadii = (lenM - radiusM) / radiusM;
  return altitudeRadii * (2 + altitudeRadii);
}

/**
 * bodySlabCamAltitudeSq — `dot(camPosLocal, camPosLocal) − 1`, the constant term
 * of the analytic sphere's ray quadratic (see `lib/analyticSphere.wesl`'s depth
 * section). Computed CPU-side because the SHADER cannot form it in f32:
 * `camPosLocal` is f32, and 10 m above Mars its components are 1 + 3e−6, where
 * one ulp is already 0.4 m — subtracting 1 there quantises the eye's altitude
 * before the quadratic runs. f64 has no such trouble either way; this form just
 * keeps the subtraction in metre units, `|eyeRelBodyM| − radiusM`.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** (h/R)·(2 + h/R) for h = |eyeRelBodyM| − radiusM — dimensionless, 0 at the surface. */
export function bodySlabCamAltitudeSq(eyeRelBodyM: Readonly<Vec3>, radiusM: number): number {
  const lenM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  const altitudeRadii = (lenM - radiusM) / radiusM;
  return altitudeRadii * (2 + altitudeRadii);
}

/**
 * How tightly a terrain pick is worth bisecting: one pixel's ground footprint
 * at the eye's altitude (spec §8.1). Clamped at zero because an eye BELOW the
 * datum — the Dead Sea, this feature's own motivating pose — otherwise yields a
 * negative tolerance that `|f| <= toleranceM` can never satisfy. Zero is the
 * honest value there rather than a floor: within a pixel of the ground there is
 * no early exit to take, so the bisection cap alone ends the search, at its
 * most precise and for a bounded extra cost. Shared by both gesture call sites
 * so the range is defined once.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import { metresPerPixelAtRange } from './metresPerPixelAtRange';

export function surfacePickToleranceM(
  eyeM: Readonly<Vec3>,
  bodyRadiusM: number,
  fovYRad: number,
  viewportPxHeight: number,
): number {
  const altitudeM = Math.max(0, Math.hypot(eyeM[0], eyeM[1], eyeM[2]) - bodyRadiusM);
  return metresPerPixelAtRange(altitudeM, fovYRad, viewportPxHeight);
}

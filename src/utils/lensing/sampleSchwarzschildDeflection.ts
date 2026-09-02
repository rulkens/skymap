/**
 * Reads `buildSchwarzschildDeflectionLut`'s table exactly as the lens pass's
 * fragment reads its GPU copy (`sgrAStarLensing/fragment.wesl`): lerp inside
 * the domain, and past it the endpoint scaled by bMax/b — the weak field's
 * ~1/b tail, pinned to the table so the handoff is continuous. The two readers
 * must agree or an S-star image and the lensed disc behind it land at different
 * angles. Pinning costs ~3% over a bare 2/b (the endpoint still carries the
 * 15pi/16b^2 correction), which inflates an Einstein radius by ~1.5%.
 */

import type { SchwarzschildDeflectionLut } from '../../@types/lensing/SchwarzschildDeflectionLut';

/** Total bending angle in radians at `impactParamRs` (units of r_s); Infinity = captured. */
export function sampleSchwarzschildDeflection(
  lut: SchwarzschildDeflectionLut,
  impactParamRs: number,
): number {
  const { samples, minImpactParamRs, maxImpactParamRs } = lut;
  const lastIndex = samples.length - 1;
  if (impactParamRs >= maxImpactParamRs) {
    return samples[lastIndex]! * (maxImpactParamRs / impactParamRs);
  }

  const span = maxImpactParamRs - minImpactParamRs;
  const gridPos = Math.max(0, (impactParamRs - minImpactParamRs) / span) * lastIndex;
  const i0 = Math.floor(gridPos);
  const a0 = samples[i0]!;
  const a1 = samples[Math.min(i0 + 1, lastIndex)]!;
  // A cell counts as captured the moment either end is: the lerp would turn an
  // Infinity endpoint into NaN (Infinity * 0) at the far side of the cell, and
  // a ray this close to the photon sphere never reaches the eye anyway.
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return Infinity;
  const frac = gridPos - i0;
  return a0 * (1 - frac) + a1 * frac;
}

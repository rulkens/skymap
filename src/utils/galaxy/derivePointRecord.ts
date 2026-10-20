/**
 * derivePointRecord — every per-galaxy derivation the point vertex record
 * carries, in one place so the flat interleave and any other upload path
 * write identical values. Writes into a caller-owned `out` (no allocation:
 * it runs once per row over ~3.5 M rows).
 */

import { SDSS_TARGET_MEAN_MAG } from '../../data/galaxyCatalog/sdssTargetMeanMag';
import { paddedRadiusMpc } from '../paddedRadiusMpc';
import { absoluteFromApparent } from '../math/absoluteFromApparent';
import { galaxySbAmp } from './galaxySbAmp';
import type { GalaxyPointFields } from '../../@types/engine/GalaxyPointFields';
import type { GalaxyPointStats } from '../../@types/engine/GalaxyPointStats';
import type { GalaxyPointDerived } from '../../@types/engine/GalaxyPointDerived';

export function derivePointRecord(
  f: GalaxyPointFields,
  stats: GalaxyPointStats,
  out: GalaxyPointDerived,
): void {
  const g = f.magnitude;
  const dMpc = Math.hypot(f.x, f.y, f.z);

  // NaN g snaps to the target mean so the row draws at average intensity.
  out.magnitude = Number.isFinite(g) ? g + stats.magOffset : SDSS_TARGET_MEAN_MAG;

  // Sign bit = fallback-orientation flag; a NaN b/a stays NaN → round mask, no flag.
  out.axisRatio = f.orientationIsFallback ? -Math.abs(f.axisRatio) : f.axisRatio;

  // Negated: PA runs east-of-north (CCW on sky), UV y points down, and
  // rotating the UV is the inverse of rotating the ellipse.
  const paRad = (-f.positionAngleDeg * Math.PI) / 180;
  out.paCos = Math.cos(paRad);
  out.paSin = Math.sin(paRad);

  // Shared helper so disk and thumbnail match this footprint; sign bit = fallback-diameter flag.
  const padded = paddedRadiusMpc(f.diameterKpc);
  out.radiusMpc = f.diameterIsFallback ? -padded : padded;

  // From the offset magnitude, not raw g: the mode-1 gate's thresholds live on
  // that shifted scale. Rounded to f32 to match slot 3's stored value; unrounded,
  // slot 10 drifts an ulp.
  out.absMag = Math.fround(out.magnitude) - 5 * Math.log10(dMpc) - 25;

  // Raw physical absMag, not the offset one; `proceduralDiskSubsystem.ts` computes
  // the same `galaxySbAmp` so the point↔disk crossfade holds brightness.
  out.sbAmp = galaxySbAmp(absoluteFromApparent(g, dMpc), stats.medianAbsMag, f.diameterKpc);
}

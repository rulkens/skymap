/**
 * galaxySbAmp — physical surface-brightness amplitude `lumRel / diamRatio²`:
 * rises for galaxies brighter than their catalog's median, falls when the
 * luminosity spreads over a larger disk (bloom follows light per screen pixel,
 * not apparent magnitude).
 *
 * `SB_REF_DIAMETER_KPC` duplicates DEFAULT_GALAXY_DIAMETER_KPC as a literal: it
 * must match `derivePointRecord.ts` exactly for the point-disk crossfade to hold
 * brightness. `SB_AMP_MAX` is only a float-safety clamp against Infinity from a
 * near-zero diameter; the live `sbMax` slider is the visible cap.
 */

const SB_REF_DIAMETER_KPC = 30;
const SB_AMP_MAX = 100000;

export function galaxySbAmp(absMag: number, medianAbsMag: number, diameterKpc: number): number {
  const diamKpc = diameterKpc > 0 ? diameterKpc : SB_REF_DIAMETER_KPC;
  const diamRatio = diamKpc / SB_REF_DIAMETER_KPC;
  const lumRel = Math.pow(10, -0.4 * (absMag - medianAbsMag));
  const raw = lumRel / (diamRatio * diamRatio);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), SB_AMP_MAX) : 1.0;
}

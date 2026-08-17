/**
 * galaxySbAmp — physical surface-brightness amplitude for one galaxy.
 *
 * "Surface brightness" here means relative luminosity spread over the
 * galaxy's projected area, NOT the raw apparent magnitude. Two galaxies at
 * wildly different distances can have identical apparent brightness (one
 * is intrinsically faint and close, the other intrinsically bright and
 * far), but they should NOT bloom the same way — bloom is a property of
 * how much light lands per screen pixel, which for a fixed apparent size
 * scales with intrinsic luminosity, and for a fixed intrinsic luminosity
 * scales inversely with projected area. Hence `lumRel / diamRatio²`: the
 * amplitude rises for galaxies that are intrinsically brighter than their
 * catalog's median AND falls for galaxies that spread that luminosity over
 * a larger apparent disk.
 *
 * `SB_REF_DIAMETER_KPC = 30` is the zero-point for the area term — the
 * project's DEFAULT_GALAXY_DIAMETER_KPC, roughly an L-star / Milky-Way-
 * scale disk. It's a normalisation choice, not a physical constant: any fixed
 * reference diameter works as long as the point bake (Stage 1) and this
 * disk-pass mirror use the SAME one, which is why it's duplicated as a
 * literal here rather than threaded through as a parameter — the value
 * has to match `buildPointInterleavedBuffer.ts`'s bake exactly for the
 * point↔disk crossfade to hold constant brightness.
 *
 * `SB_AMP_MAX` is a float-safety clamp only — it exists to keep a
 * pathologically bright-and-compact galaxy's amplitude finite, not to cap
 * the visible brightness (that's the caller's job via the live `sbMax`
 * slider, which sits orders of magnitude below this ceiling). Without it,
 * a division by a near-zero diameter could produce Infinity and poison
 * downstream min/max clamps.
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

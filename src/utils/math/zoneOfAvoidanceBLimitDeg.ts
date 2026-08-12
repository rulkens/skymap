/**
 * zoneOfAvoidanceBLimitDeg — Milky Way dust extinction is worst toward the
 * galactic bulge (`ℓ = 0`, surveys blind out to ±`bulgeDeg`) and thinnest
 * toward the anticenter (`ℓ = π`, narrows to ±`anticenterDeg`), so the guide
 * band's half-width is a cosine bump over galactic longitude rather than a
 * fixed strip (Grill Q8).
 */

export function zoneOfAvoidanceBLimitDeg(
  galacticLonRad: number,
  bulgeDeg: number,
  anticenterDeg: number,
): number {
  return anticenterDeg + (bulgeDeg - anticenterDeg) * (0.5 + 0.5 * Math.cos(galacticLonRad));
}

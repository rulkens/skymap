/**
 * ismMapRingIndexForRadius — inverts `ismMapRingRadius`'s log-radial ring index
 * -> radius mapping back to the nearest ring INDEX. Exact by construction
 * when `radius` came from `ismMapRingRadius(ring, ...)` itself (as
 * `buildIsmMapDustCdf`'s own loop does) — `Math.round` only absorbs
 * floating-point round-trip noise, never a real ambiguity between two rings.
 * Mirrors `ismMapPresent.wesl`'s own `ringT` (this function's `t` before the
 * final scale/round), so CPU placement and the GPU debug view pick the SAME
 * ring for the same radius.
 */
export function ismMapRingIndexForRadius(
  radius: number,
  rings: number,
  rMin: number,
  rMax: number,
): number {
  if (rings <= 1) return 0;
  const t = Math.log(radius / rMin) / Math.log(rMax / rMin);
  const ring = Math.round(t * (rings - 1));
  return Math.min(rings - 1, Math.max(0, ring));
}

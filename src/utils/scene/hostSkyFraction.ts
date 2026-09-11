/**
 * hostSkyFraction — the share of a body's sky its host sphere fills, seen from
 * `distToHostCentreM`. The host disc subtends half-angle `asin(s)` for
 * `s = hostRadiusM / dist`, so its solid angle `2π(1 − cos asin s)` over the
 * whole `4π` is `(1 − sqrt(1 − s²)) / 2` — no trig survives the identity.
 */
export function hostSkyFraction(hostRadiusM: number, distToHostCentreM: number): number {
  // At or inside the host surface (and at a degenerate zero distance) the disc
  // is a hemisphere; without the clamp `sqrt` of a negative returns NaN.
  const s = distToHostCentreM > hostRadiusM ? hostRadiusM / distToHostCentreM : 1;
  return (1 - Math.sqrt(1 - s * s)) / 2;
}

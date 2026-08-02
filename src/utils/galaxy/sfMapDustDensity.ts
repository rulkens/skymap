/**
 * sfMapDustDensity — the SF-map-seeded dust placement density at one texel:
 * `gas * lerp(1, recentSf, sfWeight)`. `sfWeight = 0` is the plain gas
 * channel; `sfWeight = 1` peaks where gas is high AND the front is active
 * (`gas * recentSf`), i.e. the leading edge — where real dust lanes sit
 * relative to HII regions, not `recentSf`'s own peak (which is the
 * just-swept cavity dust is depleted from). Unnormalised: callers rejection-
 * sample against this divided by its own grid maximum, never against the raw
 * value (see `buildDustParticleCloud`).
 */
export function sfMapDustDensity(gas: number, recentSf: number, sfWeight: number): number {
  return gas * (1 + sfWeight * (recentSf - 1));
}

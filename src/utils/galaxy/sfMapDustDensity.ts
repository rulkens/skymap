/**
 * sfMapDustDensity — the SF-map-seeded dust placement density at one texel:
 * `gas * lerp(1, activity, sfWeight)`, where `activity` is the automaton's
 * ACCUMULATED trace (`oldActivity`), not `recentSf`.
 *
 * `recentSf` cannot work here: igniting sets `gas = 0` and `age = 0` in the
 * same cell, so the two are anti-correlated by construction, and `recentSf`'s
 * decay (tau 12 steps) has largely run out by the time `gasRegen` has refilled
 * the cell (~17 steps). Their product is small everywhere, leaving the
 * `(1 - sfWeight)` floor to dominate and the dust nearly uniform.
 * `oldActivity` persists across that recovery and accumulates over the run, so
 * it traces every front that passed — which is the structure dust should show.
 *
 * Unnormalised: callers rejection-sample against this divided by its own grid
 * maximum, never against the raw value (see `buildDustParticleCloud`).
 */
export function sfMapDustDensity(gas: number, activity: number, sfWeight: number): number {
  return gas * (1 + sfWeight * (activity - 1));
}

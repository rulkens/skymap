/**
 * ismMapDustDensity — a texel's `gas * activity` product, where `activity` is
 * the automaton's ACCUMULATED trace, not `recentSf`. FORMERLY dust
 * placement's own density and its S3 survival filter's criterion; both now
 * key off the swept `dust` channel directly (see `dustParticleCloud.ts`'s
 * header for why). This
 * stays as a mass-weighting metric for `ismMapActivityHistogramHarness.ts`'s
 * debug stats, and as a two-channel density fixture in `buildIsmMapDustCdf`'s
 * own tests.
 *
 * `recentSf` cannot substitute for `activity` here: igniting sets `gas = 0`
 * and `age = 0` in the same cell, so the two are anti-correlated by
 * construction, and `recentSf`'s decay (tau 12 steps) has largely run out by
 * the time `gasRegen` has refilled the cell (~17 steps). `activity` persists
 * across that recovery and accumulates over the run, tracing every front
 * that passed.
 *
 * No blend weight against a `1` floor: that floor is `gas` alone once
 * `activity` is discounted, and `gas` sits near 1 across most of a quiet
 * disc, so any weight below 1 turns it into a near-uniform acceptance
 * pedestal. The blend has one correct value, so there is no knob.
 */
export function ismMapDustDensity(gas: number, activity: number): number {
  return gas * activity;
}

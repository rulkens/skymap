/**
 * sfMapDustDensity — the SF-map-seeded dust placement density at one texel:
 * `gas * activity`, where `activity` is the automaton's ACCUMULATED trace,
 * not `recentSf`.
 *
 * `recentSf` cannot work here: igniting sets `gas = 0` and `age = 0` in the
 * same cell, so the two are anti-correlated by construction, and `recentSf`'s
 * decay (tau 12 steps) has largely run out by the time `gasRegen` has refilled
 * the cell (~17 steps). Their product is small everywhere, leaving the dust
 * nearly uniform. `activity` persists across that recovery and accumulates
 * over the run, so it traces every front that passed — which is the
 * structure dust should show.
 *
 * No blend weight against a `1` floor: that floor is `gas` alone once
 * `activity` is discounted, and `gas` sits near 1 across most of a quiet
 * disc, so any weight below 1 turns it into a near-uniform acceptance
 * pedestal — it showed up on screen as a solid disc of dust in the middle
 * that only vanished once the weight was pushed all the way to 1. The blend
 * has one correct value, so there is no knob.
 *
 * Unnormalised: `buildSfMapDustCdf` weights raw texel mass with this value
 * directly (a CDF integrates to its own total, no grid-max scan needed), and
 * `buildDustParticleCloud`'s S3 survival filter compares it to a small
 * absolute floor, not a fraction of the grid max.
 */
export function sfMapDustDensity(gas: number, activity: number): number {
  return gas * activity;
}

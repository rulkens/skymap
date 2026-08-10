# Fluid ISM-map event CDF has no texel-area term

**Status:** deferred (confirmed 2026-08-08, deliberately not fixed at the time)

## Problem

`buildGalaxyIsmMapFluidEvents` places events on a log-radial polar grid by
building a cumulative-weight CDF over texels and drawing uniformly from it.
The weight has no area term, so the draw is uniform per TEXEL, not per unit
physical area — and on this grid those are very different things.

## Verified current state

- `buildGalaxyIsmMapFluidEvents`
  (`src/services/engine/galaxyGenerator/v2/galaxyIsmMapFluidEvents.ts:106-113`)
  accumulates `weights[i] = armBiasFloor + forcing[i]` texel-by-texel with no
  per-texel area factor, then draws an index via `upperBound(weights, rng() *
  total)`.
- The grid is log-radial: `ismMapRingRadius`
  (`src/utils/galaxy/ismMapRingRadius.ts`) maps ring index `t` to `rMin *
  (rMax/rMin)^t`. Ring spacing `dr` and azimuthal arc length both scale `∝ r`,
  so a texel's physical area scales `∝ r²`.
- Net effect: uniform-per-texel sampling yields an event surface density `∝
  1/r²` relative to what the same weights would give per unit physical area —
  the centre is over-seeded, the outer disc starved.
- The Kennicutt-Schmidt gas-weighted rejection sampler in the same function
  (`acceptGasWeightedCandidate`, probability `gasProfile(r)^1.4`) shapes radial
  placement further, but it was itself calibrated against the biased base
  distribution — it partially masks, not corrects, the area bias.

## Why deferred rather than fixed

Confirmed 2026-08-08 and deliberately left alone: the whole fluid ISM map's
calibration — impulse strength/duration, the rejection sampler's
`gasFloor`/`gasScaleLength`, the resulting map's look — was tuned on top of
this exact distribution. Any change to the CDF weights also reorders every
later draw in the seeded RNG stream (each event draw consumes a variable
number of `rng()` calls via the rejection loop), so fixing this recalibrates
the whole map, not just the radial profile. Byte-compatibility with the
current tuned look is not possible across this change.

## Fix sketch

Multiply each texel's CDF weight by its physical area (`∝ r_ring²`, using
`ismMapRingRadius` at that texel's ring) when accumulating `weights` in
`buildGalaxyIsmMapFluidEvents`. Requires a full visual recalibration pass
afterward (impulse strength/duration, gas-profile params, arm-bias floor) —
budget it as a recalibration, not a one-line fix.

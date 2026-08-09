/**
 * galaxyIsmMapFluidEvents — the fluid ISM-map generator's own event list,
 * built once per rebuild from a seeded RNG and biased toward the SAME
 * CPU arm-forcing field the automaton samples GPU-side
 * (`buildGalaxyIsmMapArmForcing` — the shared arm-geometry helper this
 * generator is allowed to reuse; the automaton's OWN step logic is not).
 * `ismMapFluidStep.wesl` reads the packed result as impulses in its velocity
 * field — see that file's header for how an event's kernel evolves.
 *
 * Deterministic per `seed` (mulberry32, same salted-seed idiom as
 * `hiiRegions.ts`'s DIG draws): rebuilding the same galaxy at
 * the same seed reproduces the same event list, same as the automaton's own
 * GPU hash reproduces the same ignitions.
 *
 * Returned events are sorted ascending by `birthStep` — a load-bearing
 * contract, not incidental ordering: `ismMapFluidEventWindow` below binary
 * searches this order to hand `createIsmMapFluidRunner.ts` a per-step
 * [start, end) slice of ACTIVE events only, instead of every dispatch
 * scanning the whole list (was the quadratic-rebuild-cost bug — total cost
 * grew as steps^2 * texels since the scanned range never shrank as the run
 * got longer).
 */
import { mulberry32 } from '../../../../utils/random/mulberry32';
import { ismMapGasProfile } from '../../../../utils/galaxy/ismMapGasProfile';
import { ismMapRingRadius } from '../../../../utils/galaxy/ismMapRingRadius';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { IsmMapFluidEvent } from '../../../../@types/galaxy/IsmMapFluidEvent';
import {
  buildGalaxyIsmMapArmForcing,
  ismMapGridRadius,
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
} from './galaxyIsmMapArmForcing';

/** Safely above the "several hundred events over a run" design target — a generous ceiling, not a tuned one. Overflow is truncated, not resampled. */
export const ISM_MAP_FLUID_MAX_EVENTS = 1024;

const ISM_MAP_FLUID_EVENT_SALT = 0x464c5549; // "FLUI"

/**
 * Placement weight is `ARM_BIAS_FLOOR * (1 - eventArmBias) + armForcing`, not
 * `armForcing` alone: a pure arm-forcing CDF is IDENTICALLY ZERO off the ridge
 * (`armForcing`'s own `r <= armStartRadius` skip and its Gaussian cross-track
 * falloff), which would confine every event to the arms outright — the floor
 * exists to give the whole grid a BIAS, the same "light touch" the
 * automaton's own `armForcing` param documents, not a gate. `eventArmBias`
 * (`GalaxyIsmMapFluidParams`) is now what decides bias-vs-gate: 0 (default)
 * keeps the fixed floor below, byte-identical to before this param existed;
 * 1 zeroes it, turning the floor into a hard gate — every event lands
 * strictly on the ridge.
 */
const ARM_BIAS_FLOOR = 0.15;

/** First index whose cumulative weight exceeds `u` — same upper-bound search idiom as `sampleIsmMapDustCdf.ts`'s local `upperBound`, not exported from there (that one is keyed to a built `GalaxyIsmMapDustCdf`, which does not exist yet at event-generation time). */
function upperBound(prefix: Float64Array, u: number): number {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid]! > u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Kennicutt-Schmidt law: SFR surface density scales as gas surface density^1.4 — the exponent an event-radius rejection test below weights candidates by. */
const KENNICUTT_SCHMIDT_INDEX = 1.4;

/** Bounded redraw count for the gas-weighted rejection sampler below — several hundred events at a thin outer disc could otherwise spin a long time near-never-accepting; 32 tries then keep-the-last-draw trades a slightly-too-generous outer-disc placement for a hard latency ceiling. */
const MAX_GAS_WEIGHT_TRIES = 32;

/**
 * Acceptance test for the rejection sampler below: probability
 * `gasProfile(r)^KENNICUTT_SCHMIDT_INDEX` (`gasProfile`'s own max is ~1 at
 * r=rMin, so the ratio to that max is the profile value itself — no
 * rescaling needed). Short-circuits WITHOUT drawing from `rng` when the
 * probability is exactly 1: at `gasFloor=1` (or any r where the profile
 * saturates) every candidate is always accepted, and an unconditional extra
 * `rng()` draw would shift every LATER event's RNG stream even though
 * nothing about placement actually changed — this is the only way
 * `buildGalaxyIsmMapFluidEvents` stays byte-identical to its pre-profile
 * output at the default `gasFloor=1`.
 */
function acceptGasWeightedCandidate(
  r: number,
  gasFloor: number,
  gasScaleLength: number,
  rng: () => number,
): boolean {
  const prob = ismMapGasProfile(r, gasFloor, gasScaleLength) ** KENNICUTT_SCHMIDT_INDEX;
  if (prob >= 1) return true;
  return rng() < prob;
}

export function buildGalaxyIsmMapFluidEvents(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly IsmMapFluidEvent[] {
  const fluid = tuning.ismMapFluid;
  const requested = Math.round(fluid.eventRate * fluid.steps);
  const count = Math.min(Math.max(requested, 0), ISM_MAP_FLUID_MAX_EVENTS);
  if (count === 0) return [];

  const forcing = buildGalaxyIsmMapArmForcing(geometry, tuning);
  const armBiasFloor = ARM_BIAS_FLOOR * (1 - fluid.eventArmBias);
  const weights = new Float64Array(forcing.length);
  let total = 0;
  for (let i = 0; i < forcing.length; i++) {
    total += armBiasFloor + forcing[i]!;
    weights[i] = total;
  }

  const { rMin, rMax } = ismMapGridRadius(geometry);
  const rng = mulberry32(seed ^ ISM_MAP_FLUID_EVENT_SALT);
  const events: IsmMapFluidEvent[] = new Array(count);
  for (let k = 0; k < count; k++) {
    // Kennicutt-Schmidt-weighted rejection sampling: redraw the whole
    // candidate (arm-biased index + sub-texel jitter) on reject, bounded by
    // MAX_GAS_WEIGHT_TRIES rather than looping forever — see
    // acceptGasWeightedCandidate for the byte-identical-at-gasFloor=1
    // invariant this loop depends on.
    let az = 0;
    let ring = 0;
    for (let attempt = 0; attempt < MAX_GAS_WEIGHT_TRIES; attempt++) {
      const index = upperBound(weights, rng() * total);
      const ringIndex = Math.floor(index / ISM_MAP_AZ);
      const azIndex = index % ISM_MAP_AZ;
      // Sub-texel jitter so events don't all land on integer grid points —
      // the shader's kernel is continuous, so this costs nothing and avoids
      // a visible lattice in a sparse run.
      az = azIndex + rng();
      ring = ringIndex + rng();
      const r = ismMapRingRadius(ring, ISM_MAP_RINGS, rMin, rMax);
      if (acceptGasWeightedCandidate(r, fluid.gasFloor, fluid.gasScaleLength, rng)) break;
    }
    events[k] = {
      az,
      ring,
      birthStep: Math.floor(rng() * fluid.steps),
      strength: fluid.impulseStrength * (0.7 + 0.6 * rng()),
      radiusScale: fluid.radiusScale * (0.7 + 0.6 * rng()),
    };
  }
  // Ascending by birthStep — see this function's own docblock for why this
  // order is a contract, not a convenience.
  events.sort((a, b) => a.birthStep - b.birthStep);
  return events;
}

/** Index range in `events` (see `ismMapFluidEventWindow`'s docblock). */
export type IsmMapFluidEventWindow = {
  readonly start: number;
  readonly end: number;
};

/**
 * `[start, end)` slice of a birthStep-sorted `events` list active at
 * generation `step` — same age window `ismMapFluidStep.wesl`'s own per-event
 * `age < 0.0 || age >= impulseDuration` skip tests, but computed once
 * CPU-side per step via two binary searches instead of every GPU texel
 * walking every event ever generated. `events` MUST already be sorted
 * ascending by `birthStep` (`buildGalaxyIsmMapFluidEvents`'s own contract) —
 * this function does not sort, so a caller with an unsorted list gets a
 * silently wrong window, not a thrown error.
 */
export function ismMapFluidEventWindow(
  events: readonly IsmMapFluidEvent[],
  step: number,
  impulseDuration: number,
): IsmMapFluidEventWindow {
  return {
    start: firstIndexWithBirthStepAbove(events, step - impulseDuration),
    end: firstIndexWithBirthStepAbove(events, step),
  };
}

/** First index whose `birthStep` exceeds `threshold` — same upper-bound search idiom as this file's own `upperBound`, kept separate since it walks event objects by field, not a raw cumulative-weight array. */
function firstIndexWithBirthStepAbove(
  events: readonly IsmMapFluidEvent[],
  threshold: number,
): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid]!.birthStep > threshold) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

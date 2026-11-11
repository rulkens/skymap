/**
 * The fluid ISM-map generator's own event list, built once per rebuild from
 * a seeded RNG (mulberry32) and biased toward the same CPU arm-forcing field
 * the fluid step shader samples GPU-side (`buildGalaxyIsmMapArmForcing`).
 * `ismMapFluidStep.wesl` reads the packed result as velocity-field impulses.
 *
 * Returned events are sorted ascending by `birthStep` — a contract:
 * `ismMapFluidEventWindow` (its own file) binary-searches this order to hand a
 * per-step [start, end) slice of active events, not the whole list.
 */
import { mulberry32 } from '../../../../../utils/random/mulberry32';
import { ismMapGasProfile } from './ismMapGasProfile';
import { ismMapRingRadius } from '../../../../../utils/galaxy/ismMapRingRadius';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { IsmMapFluidEvent } from '../@types/IsmMapFluidEvent';
import { buildGalaxyIsmMapArmForcing } from './buildGalaxyIsmMapArmForcing';
import { ISM_MAP_FLUID_MAX_EVENTS } from '../data/ismMapFluidMaxEvents';
import { ismMapGridRadius } from './ismMapGridRadius';
import { ISM_MAP_AZ } from '../data/ismMapAz';
import { ISM_MAP_RINGS } from '../data/ismMapRings';

const ISM_MAP_FLUID_EVENT_SALT = 0x464c5549; // "FLUI"

/**
 * Placement weight is `ARM_BIAS_FLOOR * (1 - eventArmBias) + armForcing`, not
 * `armForcing` alone: a pure arm-forcing CDF is zero off the ridge
 * (`armForcing`'s own `r <= armStartRadius` skip and Gaussian cross-track
 * falloff), which would confine every event to the arms — the floor gives
 * the whole grid a light-touch bias, not a gate. `eventArmBias` (0..1) tunes
 * bias-vs-gate: at 1 the floor zeroes out and every event lands on the ridge.
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
 * r=rMin, so no rescaling is needed). Short-circuits without drawing from
 * `rng` when the probability is exactly 1 — an unconditional extra `rng()`
 * draw would shift every later event's RNG stream even when nothing about
 * placement changed.
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
    // MAX_GAS_WEIGHT_TRIES rather than looping forever.
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
  events.sort((a, b) => a.birthStep - b.birthStep); // ascending by birthStep — see docblock above
  return events;
}

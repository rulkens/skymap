/**
 * galaxySfMapFluidEvents — the fluid SF-map generator's own event list,
 * built once per rebuild from a seeded RNG and biased toward the SAME
 * CPU arm-forcing field the automaton samples GPU-side
 * (`buildGalaxySfMapArmForcing` — the shared arm-geometry helper this
 * generator is allowed to reuse; the automaton's OWN step logic is not).
 * `sfMapFluidStep.wesl` reads the packed result as impulses in its velocity
 * field — see that file's header for how an event's kernel evolves.
 *
 * Deterministic per `seed` (mulberry32, same salted-seed idiom as
 * `hiiRegions.ts`'s DIG/associations draws): rebuilding the same galaxy at
 * the same seed reproduces the same event list, same as the automaton's own
 * GPU hash reproduces the same ignitions.
 */
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { SfMapFluidEvent } from '../../../../@types/galaxy/SfMapFluidEvent';
import { buildGalaxySfMapArmForcing, SF_MAP_AZ } from './galaxySfMapArmForcing';

/** Safely above the "several hundred events over a run" design target — a generous ceiling, not a tuned one. Overflow is truncated, not resampled. */
export const SF_MAP_FLUID_MAX_EVENTS = 1024;

const SF_MAP_FLUID_EVENT_SALT = 0x464c5549; // "FLUI"

/**
 * Placement weight is `ARM_BIAS_FLOOR + armForcing`, not `armForcing` alone:
 * a pure arm-forcing CDF is IDENTICALLY ZERO off the ridge (`armForcing`'s
 * own `r <= armStartRadius` skip and its Gaussian cross-track falloff), which
 * would confine every event to the arms outright — this generator wants a
 * BIAS, the same "light touch" the automaton's own `armForcing` param
 * documents, not a gate.
 */
const ARM_BIAS_FLOOR = 0.15;

/** First index whose cumulative weight exceeds `u` — same upper-bound search idiom as `sampleSfMapDustCdf.ts`'s local `upperBound`, not exported from there (that one is keyed to a built `GalaxySfMapDustCdf`, which does not exist yet at event-generation time). */
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

export function buildGalaxySfMapFluidEvents(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly SfMapFluidEvent[] {
  const fluid = tuning.sfMapFluid;
  const requested = Math.round(fluid.eventRate * fluid.steps);
  const count = Math.min(Math.max(requested, 0), SF_MAP_FLUID_MAX_EVENTS);
  if (count === 0) return [];

  const forcing = buildGalaxySfMapArmForcing(geometry, tuning);
  const weights = new Float64Array(forcing.length);
  let total = 0;
  for (let i = 0; i < forcing.length; i++) {
    total += ARM_BIAS_FLOOR + forcing[i]!;
    weights[i] = total;
  }

  const rng = mulberry32(seed ^ SF_MAP_FLUID_EVENT_SALT);
  const events: SfMapFluidEvent[] = new Array(count);
  for (let k = 0; k < count; k++) {
    const index = upperBound(weights, rng() * total);
    const ring = Math.floor(index / SF_MAP_AZ);
    const az = index % SF_MAP_AZ;
    events[k] = {
      // Sub-texel jitter so events don't all land on integer grid points —
      // the shader's kernel is continuous, so this costs nothing and avoids
      // a visible lattice in a sparse run.
      az: az + rng(),
      ring: ring + rng(),
      birthStep: Math.floor(rng() * fluid.steps),
      strength: fluid.impulseStrength * (0.7 + 0.6 * rng()),
      radiusScale: fluid.radiusScale * (0.7 + 0.6 * rng()),
    };
  }
  return events;
}

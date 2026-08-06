/**
 * buildGalaxySfMapFluidEvents — three things a real bug could break and
 * nothing else catches: a seed that stops reproducing its own event list, an
 * arm bias that points the wrong way (or isn't a bias at all), and a
 * requested count that overruns the GPU buffer's fixed capacity.
 *
 * sfMapFluidEventWindow — the binary search that replaced a per-step, whole
 * -list GPU scan (`createSfMapFluidRunner.ts`'s own docblock); a boundary
 * bug here would silently drop or duplicate active events per step.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildGalaxySfMapArmForcing,
  SF_MAP_AZ,
  SF_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import {
  buildGalaxySfMapFluidEvents,
  sfMapFluidEventWindow,
  SF_MAP_FLUID_MAX_EVENTS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapFluidEvents';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/**
 * Standalone reconstruction of the PRE-Kennicutt-Schmidt event placement
 * (arm-biased CDF pick + sub-texel jitter, no gas-weighted rejection loop) —
 * duplicates the private ARM_BIAS_FLOOR/salt/upperBound galaxySfMapFluidEvents.ts
 * does not export, purely so this test can pin the byte-identical-at-
 * gasFloor=1 invariant against an independent implementation rather than
 * against the same code path it is meant to catch a regression in.
 */
function legacyUnweightedEvents(
  geometry: ReturnType<typeof describeGalaxy>,
  tuning: typeof DEFAULT_GALAXY_FIELD_TUNING,
  seed: number,
): ReadonlyArray<{
  az: number;
  ring: number;
  birthStep: number;
  strength: number;
  radiusScale: number;
}> {
  const ARM_BIAS_FLOOR = 0.15;
  const SALT = 0x464c5549; // "FLUI" — mirrors galaxySfMapFluidEvents.ts's private salt
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
  const upperBound = (u: number): number => {
    let lo = 0;
    let hi = weights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (weights[mid]! > u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  const rng = mulberry32(seed ^ SALT);
  const events = [];
  for (let k = 0; k < count; k++) {
    const index = upperBound(rng() * total);
    const ring = Math.floor(index / SF_MAP_AZ);
    const az = index % SF_MAP_AZ;
    events.push({
      az: az + rng(),
      ring: ring + rng(),
      birthStep: Math.floor(rng() * fluid.steps),
      strength: fluid.impulseStrength * (0.7 + 0.6 * rng()),
      radiusScale: fluid.radiusScale * (0.7 + 0.6 * rng()),
    });
  }
  events.sort((a, b) => a.birthStep - b.birthStep);
  return events;
}

describe('buildGalaxySfMapFluidEvents', () => {
  it('is deterministic: the same seed reproduces the same event list', () => {
    const a = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 42);
    const b = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 42);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0); // sanity: the MW preset's defaults really produce events
  });

  it('at gasFloor=1 (gasProfile identically 1 everywhere) and eventArmBias=0, the gas-weighted rejection sampler never rejects and the placement floor is the fixed ARM_BIAS_FLOOR — event placement is byte-identical to the pre-profile, pre-eventArmBias, unweighted algorithm. This is also the eventArmBias=0 regression pin: an inverted or dropped (1 - eventArmBias) multiplier would zero the floor at 0 instead of leaving it at ARM_BIAS_FLOOR, and diverge here.', () => {
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      sfMapFluid: { ...DEFAULT_GALAXY_FIELD_TUNING.sfMapFluid, gasFloor: 1, eventArmBias: 0 },
    };
    const withWeighting = buildGalaxySfMapFluidEvents(geometry, tuning, 13);
    const withoutWeighting = legacyUnweightedEvents(geometry, tuning, 13);
    expect(withWeighting.length).toBeGreaterThan(0); // sanity: a trivially-empty comparison would pass vacuously
    expect(withWeighting).toEqual(withoutWeighting);
  });

  it('at the shipped default gasFloor (0.07), event placement diverges from the unweighted algorithm — the rejection sampler is actually doing something', () => {
    const withWeighting = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 13);
    const withoutWeighting = legacyUnweightedEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 13);
    expect(withWeighting).not.toEqual(withoutWeighting);
  });

  it('a different seed produces a different event list', () => {
    const a = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 1);
    const b = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 2);
    expect(a).not.toEqual(b);
  });

  it('biases placement toward the arm-forcing field, not away from it or uniformly', () => {
    const forcing = buildGalaxySfMapArmForcing(geometry, DEFAULT_GALAXY_FIELD_TUNING);
    let gridTotal = 0;
    for (let i = 0; i < forcing.length; i++) gridTotal += forcing[i]!;
    const gridMean = gridTotal / forcing.length;

    const events = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 7);
    expect(events.length).toBeGreaterThan(0);
    let eventTotal = 0;
    for (const e of events) {
      const az = Math.min(SF_MAP_AZ - 1, Math.round(e.az)) % SF_MAP_AZ;
      // Same top-edge overflow as az above: `e.ring`'s own sub-texel jitter
      // (`ring + rng()`, see buildGalaxySfMapFluidEvents) can round up to
      // SF_MAP_RINGS at the outermost ring — clamp rather than index past
      // the array into NaN.
      const ring = Math.min(SF_MAP_RINGS - 1, Math.round(e.ring));
      eventTotal += forcing[ring * SF_MAP_AZ + az]!;
    }
    const eventMean = eventTotal / events.length;

    expect(eventMean).toBeGreaterThan(gridMean);
  });

  it('at eventArmBias 1, the placement floor is zeroed to a hard gate — every event lands on a texel with nonzero armForcing', () => {
    const forcing = buildGalaxySfMapArmForcing(geometry, DEFAULT_GALAXY_FIELD_TUNING);
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      sfMapFluid: { ...DEFAULT_GALAXY_FIELD_TUNING.sfMapFluid, eventArmBias: 1 },
    };
    const events = buildGalaxySfMapFluidEvents(geometry, tuning, 7);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      // Same clamp-the-jitter-overflow rounding as the arm-bias test above.
      const az = Math.min(SF_MAP_AZ - 1, Math.round(e.az)) % SF_MAP_AZ;
      const ring = Math.min(SF_MAP_RINGS - 1, Math.round(e.ring));
      expect(forcing[ring * SF_MAP_AZ + az]).toBeGreaterThan(0);
    }
  });

  it('caps the requested event count at SF_MAP_FLUID_MAX_EVENTS', () => {
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      sfMapFluid: {
        ...DEFAULT_GALAXY_FIELD_TUNING.sfMapFluid,
        eventRate: 1000,
        steps: 1000,
      },
    };
    const events = buildGalaxySfMapFluidEvents(geometry, tuning, 3);
    expect(events.length).toBe(SF_MAP_FLUID_MAX_EVENTS);
  });

  it('returns no events when the requested count is zero', () => {
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      sfMapFluid: { ...DEFAULT_GALAXY_FIELD_TUNING.sfMapFluid, eventRate: 0 },
    };
    expect(buildGalaxySfMapFluidEvents(geometry, tuning, 5)).toEqual([]);
  });

  it('sorts events ascending by birthStep — sfMapFluidEventWindow binary searches this order', () => {
    const events = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 11);
    expect(events.length).toBeGreaterThan(1); // sanity: a single-element list can't show a sort bug
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.birthStep).toBeGreaterThanOrEqual(events[i - 1]!.birthStep);
    }
  });
});

describe('sfMapFluidEventWindow', () => {
  it('selects exactly the events active at a given step, given a birthStep-sorted list', () => {
    const events = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 7);
    const { impulseDuration, steps } = DEFAULT_GALAXY_FIELD_TUNING.sfMapFluid;
    const step = Math.floor(steps / 2);

    const { start, end } = sfMapFluidEventWindow(events, step, impulseDuration);

    const expectedIndices = events.reduce<number[]>((acc, e, i) => {
      const age = step - e.birthStep;
      if (age >= 0 && age < impulseDuration) acc.push(i);
      return acc;
    }, []);
    expect(Array.from({ length: end - start }, (_, k) => start + k)).toEqual(expectedIndices);
  });

  it('returns an empty range at a step nothing is active on both sides of the run', () => {
    const events: ReturnType<typeof buildGalaxySfMapFluidEvents> = [
      { az: 0, ring: 0, birthStep: 10, strength: 1, radiusScale: 1 },
      { az: 0, ring: 0, birthStep: 10, strength: 1, radiusScale: 1 },
    ];
    const impulseDuration = 5;
    expect(sfMapFluidEventWindow(events, 0, impulseDuration)).toEqual({ start: 0, end: 0 }); // before any birth
    expect(sfMapFluidEventWindow(events, 20, impulseDuration)).toEqual({ start: 2, end: 2 }); // long past impulseDuration
  });
});

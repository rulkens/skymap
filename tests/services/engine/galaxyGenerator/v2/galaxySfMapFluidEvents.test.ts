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
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import {
  buildGalaxySfMapFluidEvents,
  sfMapFluidEventWindow,
  SF_MAP_FLUID_MAX_EVENTS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapFluidEvents';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

describe('buildGalaxySfMapFluidEvents', () => {
  it('is deterministic: the same seed reproduces the same event list', () => {
    const a = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 42);
    const b = buildGalaxySfMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 42);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0); // sanity: the MW preset's defaults really produce events
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
      const ring = Math.round(e.ring);
      eventTotal += forcing[ring * SF_MAP_AZ + az]!;
    }
    const eventMean = eventTotal / events.length;

    expect(eventMean).toBeGreaterThan(gridMean);
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

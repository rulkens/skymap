/**
 * ismMapFluidEventWindow — the binary search that avoids a per-step,
 * whole-list GPU scan (`createIsmMapFluidRunner.ts`'s own docblock); a
 * boundary bug here would silently drop or duplicate active events per step.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../../src/layers/milkyWay/field/mixture/utils/galaxyFieldMixture';
import { buildGalaxyIsmMapFluidEvents } from '../../../../../../src/layers/milkyWay/field/ismMap/utils/buildGalaxyIsmMapFluidEvents';
import { ismMapFluidEventWindow } from '../../../../../../src/layers/milkyWay/field/ismMap/utils/ismMapFluidEventWindow';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

describe('ismMapFluidEventWindow', () => {
  it('selects exactly the events active at a given step, given a birthStep-sorted list', () => {
    const events = buildGalaxyIsmMapFluidEvents(geometry, DEFAULT_GALAXY_FIELD_TUNING, 7);
    const { impulseDuration, steps } = DEFAULT_GALAXY_FIELD_TUNING.ismMapFluid;
    const step = Math.floor(steps / 2);

    const { start, end } = ismMapFluidEventWindow(events, step, impulseDuration);

    const expectedIndices = events.reduce<number[]>((acc, e, i) => {
      const age = step - e.birthStep;
      if (age >= 0 && age < impulseDuration) acc.push(i);
      return acc;
    }, []);
    expect(Array.from({ length: end - start }, (_, k) => start + k)).toEqual(expectedIndices);
  });

  it('returns an empty range at a step nothing is active on both sides of the run', () => {
    const events: ReturnType<typeof buildGalaxyIsmMapFluidEvents> = [
      { az: 0, ring: 0, birthStep: 10, strength: 1, radiusScale: 1 },
      { az: 0, ring: 0, birthStep: 10, strength: 1, radiusScale: 1 },
    ];
    const impulseDuration = 5;
    expect(ismMapFluidEventWindow(events, 0, impulseDuration)).toEqual({ start: 0, end: 0 }); // before any birth
    expect(ismMapFluidEventWindow(events, 20, impulseDuration)).toEqual({ start: 2, end: 2 }); // long past impulseDuration
  });
});

/** Pure-function coverage for the lifecycle math behind the mid-age fluid-event band boundary. */
import { describe, expect, it } from 'vitest';
import { fluidMidAgeEventWindow } from '../../../../../../src/layers/milkyWay/field/starFormation/utils/fluidMidAgeEventWindow';
import type { IsmMapFluidEvent } from '../../../../../../src/layers/milkyWay/field/ismMap/@types/IsmMapFluidEvent';

describe('fluidMidAgeEventWindow', () => {
  const steps = 100;
  const impulseDuration = 20;

  function makeEvent(birthStep: number): IsmMapFluidEvent {
    return { az: 0, ring: 0, birthStep, strength: 1, radiusScale: 1 };
  }

  it('places a just-born event (age 0) outside the mid-age band — it is still young', () => {
    const events = [makeEvent(steps - 1)]; // age = 1
    const { start, end } = fluidMidAgeEventWindow(events, steps, impulseDuration);
    expect(end - start).toBe(0);
  });

  it('places an event just past the HII window in the mid-age band', () => {
    const events = [makeEvent(steps - impulseDuration - 1)]; // age = impulseDuration + 1
    const { start, end } = fluidMidAgeEventWindow(events, steps, impulseDuration);
    expect(end - start).toBe(1);
  });

  it('excludes an event past RECENT_EVENT_AGE_FRAC_CEIL of the run — it has aged out entirely', () => {
    const events = [makeEvent(0)]; // age = steps, the oldest possible
    const { start, end } = fluidMidAgeEventWindow(events, steps, impulseDuration);
    expect(end - start).toBe(0);
  });

  it('sorts a mixed birthStep list correctly into young/mid/aged-out counts', () => {
    const events = [
      makeEvent(steps - 1), // young
      makeEvent(steps - impulseDuration - 5), // mid
      makeEvent(steps - impulseDuration - 10), // mid
      makeEvent(1), // aged out (age = 99, past the 0.75 ceiling)
    ].sort((a, b) => a.birthStep - b.birthStep); // caller contract: ascending birthStep
    const { start, end } = fluidMidAgeEventWindow(events, steps, impulseDuration);
    expect(end - start).toBe(2);
  });
});

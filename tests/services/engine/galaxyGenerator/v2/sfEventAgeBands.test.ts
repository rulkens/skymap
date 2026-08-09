/**
 * Pure-function coverage for the lifecycle math task #10 introduced: the
 * mid-age fluid-event band boundary, and the population-scaler ->
 * complex-count clamp the DIG veil uses.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveComplexCount,
  fluidMidAgeEventWindow,
} from '../../../../../src/services/engine/galaxyGenerator/v2/sfEventAgeBands';
import type { IsmMapFluidEvent } from '../../../../../src/@types/galaxy/IsmMapFluidEvent';

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

describe('deriveComplexCount', () => {
  it('scales population by the scaler and rounds to the nearest whole complex', () => {
    expect(deriveComplexCount(100, 0.5, 4, 1000)).toBe(50);
    expect(deriveComplexCount(10.4, 1, 4, 1000)).toBe(10);
  });

  it('clamps to maxCount / childrenPerComplex rather than growing past the component budget', () => {
    expect(deriveComplexCount(1000, 1, 4, 40)).toBe(10); // floor(40/4)
  });

  it('a zero or negative scaler/population yields zero, never a negative count', () => {
    expect(deriveComplexCount(100, 0, 4, 1000)).toBe(0);
    expect(deriveComplexCount(-5, 1, 4, 1000)).toBe(0);
  });
});

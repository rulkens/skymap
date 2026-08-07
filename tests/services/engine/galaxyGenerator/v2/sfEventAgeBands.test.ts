/**
 * Pure-function coverage for the lifecycle math task #10 introduced:
 * shear-drift sign/direction, the mid-age fluid-event band boundary, and the
 * population-scaler -> complex-count/seed-selection clamp both the DIG veil
 * and blue-association tiers now share.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import {
  deriveComplexCount,
  driftedAssociationSeed,
  fluidMidAgeEventWindow,
  selectAssociationSeeds,
  shearOmega,
} from '../../../../../src/services/engine/galaxyGenerator/v2/sfEventAgeBands';
import type { IsmMapFluidEvent } from '../../../../../src/@types/galaxy/IsmMapFluidEvent';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const COROTATION_RADIUS = 8.9;
const SHEAR_STRENGTH = 0.015;

describe('shearOmega', () => {
  it('is positive inside corotation, negative outside, and zero at corotation itself', () => {
    expect(shearOmega(COROTATION_RADIUS / 2, COROTATION_RADIUS, SHEAR_STRENGTH)).toBeGreaterThan(0);
    expect(shearOmega(COROTATION_RADIUS * 2, COROTATION_RADIUS, SHEAR_STRENGTH)).toBeLessThan(0);
    expect(shearOmega(COROTATION_RADIUS, COROTATION_RADIUS, SHEAR_STRENGTH)).toBeCloseTo(0, 10);
  });
});

describe('driftedAssociationSeed', () => {
  const radius = COROTATION_RADIUS / 2; // inside corotation: shearOmega > 0
  const angle = 0; // along = warpSurfaceFrame(radius, 0, geometry).along, a fixed reference direction
  const center: Vec3 = [radius, 0.4, 0];

  it('driftStrength 0 leaves the seed at the event center (x/z), regardless of age', () => {
    const seed = driftedAssociationSeed(
      center,
      radius,
      angle,
      /* ageSteps */ 50,
      /* driftStrength */ 0,
      COROTATION_RADIUS,
      SHEAR_STRENGTH,
      geometry,
    );
    expect(seed.point[0]).toBeCloseTo(center[0], 10);
    expect(seed.point[2]).toBeCloseTo(center[2], 10);
  });

  it('a positive age moves the seed off-center, and doubling age roughly doubles the displacement (small-angle regime)', () => {
    const near = driftedAssociationSeed(
      center,
      radius,
      angle,
      10,
      1,
      COROTATION_RADIUS,
      SHEAR_STRENGTH,
      geometry,
    );
    const far = driftedAssociationSeed(
      center,
      radius,
      angle,
      20,
      1,
      COROTATION_RADIUS,
      SHEAR_STRENGTH,
      geometry,
    );
    const dist = (p: { readonly point: Vec3 }): number =>
      Math.hypot(p.point[0] - center[0], p.point[2] - center[2]);
    expect(dist(near)).toBeGreaterThan(0);
    expect(dist(far)).toBeCloseTo(dist(near) * 2, 5);
  });

  it('inside vs outside corotation drift in opposite directions for the same age', () => {
    const insideAngle = driftedAssociationSeed(
      [radius, 0, 0],
      radius,
      0,
      30,
      1,
      COROTATION_RADIUS,
      SHEAR_STRENGTH,
      geometry,
    );
    const outsideRadius = COROTATION_RADIUS * 2;
    const outsideAngle = driftedAssociationSeed(
      [outsideRadius, 0, 0],
      outsideRadius,
      0,
      30,
      1,
      COROTATION_RADIUS,
      SHEAR_STRENGTH,
      geometry,
    );
    // `along` at angle 0 is (0, *, 1) (warpSurfaceFrame's `[-sin, ., cos]`),
    // so the drift shows up entirely on the z axis here — its SIGN is what
    // this test pins, not its magnitude (already covered above).
    expect(Math.sign(insideAngle.point[2])).not.toBe(Math.sign(outsideAngle.point[2]));
  });
});

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

describe('selectAssociationSeeds', () => {
  const seeds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('strides evenly across the population when thinning it', () => {
    expect(selectAssociationSeeds(seeds, 5)).toEqual([0, 2, 4, 6, 8]);
  });

  it('cycles back through the population when the desired count exceeds it', () => {
    expect(selectAssociationSeeds(seeds.slice(0, 3), 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it('returns empty for an empty population or a non-positive count', () => {
    expect(selectAssociationSeeds([], 5)).toEqual([]);
    expect(selectAssociationSeeds(seeds, 0)).toEqual([]);
  });
});

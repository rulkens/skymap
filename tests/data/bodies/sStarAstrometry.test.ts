/**
 * The acceptance gate for the S-star frame conversion: propagate seed elements
 * to Gillessen+ 2017's own observation epochs and compare the projected sky
 * offsets against the measured ones (`tests/fixtures/sStarAstrometry.json`).
 * No analytic invariant substitutes for it — dropping the inclination flip
 * reflects every orbit through the plane of the sky, and pericentre distance,
 * period and body-sits-on-its-own-trail all stay exactly correct under that
 * reflection. Only observed positions tell a mirrored orbit from a real one.
 */

import { describe, it, expect } from 'vitest';
import FIXTURE from '../../fixtures/sStarAstrometry.json';
import { sStar, GALACTIC_CENTRE_SKY_FRAME } from '../../../src/data/bodies/makers/sStar';
import { S_STAR_SEEDS } from '../../../src/data/bodies/sStarElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { Vec3 } from '../../../src/@types/math/Vec3';

type FixtureStarId = keyof typeof FIXTURE.stars;

// R₀ restated independently of the maker's private copy, so a changed distance
// scale shifts the predicted offsets here instead of cancelling out.
const GC_DISTANCE_MPC = 8178 * SCALE_UNITS.PC_TO_MPC;

// Fixture epochs are Julian years (ReadMe note G1), the year `propagateElements`'s
// century divisor assumes — so its mean-anomaly advance is exactly `2π(t−2000)/P`.
const DAYS_PER_JULIAN_YEAR = 365.25;

const RAD_TO_MAS = (180 / Math.PI) * 3600 * 1000;

/**
 * As shipped: mean 2.25σ / 1.33σ / 1.23σ, worst epoch 6.51σ; with the i flip
 * dropped, 466σ / 495σ / 31σ and 120σ. The caps sit between with ~3× headroom
 * either way, unfitted on purpose — table5's origin is a ±0.2 mas estimate of
 * Sgr A*'s radio position (Plewa+ 2015), not the true point mass.
 */
const MAX_MEAN_SIGMA = 8;
const MAX_SINGLE_EPOCH_SIGMA = 20;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Per-epoch |residual| in units of the quoted uncertainty. */
function residualSigmas(starId: FixtureStarId): { mean: number; worst: number } {
  const elements = sStar(S_STAR_SEEDS.find((seed) => seed.id === starId)!);
  const { xAxis, yAxis } = GALACTIC_CENTRE_SKY_FRAME;

  const sigmas = FIXTURE.stars[starId].observations.map((obs) => {
    const simDays = CONST_J2000 + (obs.epochYr - 2000) * DAYS_PER_JULIAN_YEAR;
    // A WORLD vector, hence the projection onto the basis rather than components.
    const world = keplerianPositionMpc(propagateElements(elements, simDays));
    const eastMas = (dot(world, xAxis) / GC_DISTANCE_MPC) * RAD_TO_MAS;
    const northMas = (dot(world, yAxis) / GC_DISTANCE_MPC) * RAD_TO_MAS;
    return Math.hypot(
      (eastMas - obs.offsetEastMas) / obs.uncertaintyEastMas,
      (northMas - obs.offsetNorthMas) / obs.uncertaintyNorthMas,
    );
  });

  return {
    mean: sigmas.reduce((total, sigma) => total + sigma, 0) / sigmas.length,
    worst: Math.max(...sigmas),
  };
}

describe('S-star astrometry', () => {
  it('S2 reproduces its observed sky positions across epochs', () => {
    const { mean, worst } = residualSigmas('s2');
    expect(mean).toBeLessThan(MAX_MEAN_SIGMA);
    expect(worst).toBeLessThan(MAX_SINGLE_EPOCH_SIGMA);
  });

  it('a prograde and a retrograde star both reproduce their observed positions', () => {
    // The mirror gate. S12 (i = 33.56°) and S38 (i = 171.1°) straddle i = 90°,
    // both far from the edge-on degeneracy, which is what makes a sign error in
    // the i conversion fail: same-sense stars go green against the exact bug.
    for (const starId of ['s12', 's38'] as const) {
      const { mean, worst } = residualSigmas(starId);
      expect(mean, `${starId} mean residual`).toBeLessThan(MAX_MEAN_SIGMA);
      expect(worst, `${starId} worst epoch`).toBeLessThan(MAX_SINGLE_EPOCH_SIGMA);
    }
  });
});

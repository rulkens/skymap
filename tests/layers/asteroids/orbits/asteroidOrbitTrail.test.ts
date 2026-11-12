import { describe, expect, it } from 'vitest';
import { asteroidOrbitTrail } from '../../../../src/layers/asteroids/orbits/utils/asteroidOrbitTrail';
import { asteroidHelioAu } from '../../../../src/layers/asteroids/kepler/utils/asteroidHelioAu';
import { eccentricAnomalyFromMean } from '../../../../src/utils/orbit/eccentricAnomalyFromMean';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { FIXTURE_EPOCH_JD, loadedAsteroids } from '../fixtures/loadedAsteroids';
import { relErr } from '../../../support/relErr';

const { catalog } = loadedAsteroids();
// Off the origin, so a trail that ignored the Sun's position would miss.
const SUN: Vec3 = [3e-6, -2e-6, 1e-6];

describe('asteroidOrbitTrail', () => {
  it('the trail passes through the dot', () => {
    for (const [k, dtDays] of [
      [1, 0],
      [4, 9000.25],
      [2, -30000],
    ] as const) {
      const at = FIXTURE_EPOCH_JD + dtDays;
      const trail = asteroidOrbitTrail(catalog, k, at, SUN, [1, 1, 1], 1);
      const E = eccentricAnomalyFromMean(trail.meanAnomalyRad, trail.eccentricity);
      const helio = asteroidHelioAu(catalog, k, at);
      [0, 1, 2].forEach((axis) => {
        const onConic =
          trail.centerMpc[axis]! +
          trail.semiMajorMpc[axis]! * Math.cos(E) +
          trail.semiMinorMpc[axis]! * Math.sin(E);
        const dot = SUN[axis]! + helio[axis]! * SCALE_UNITS.AU_TO_MPC;
        expect(relErr(onConic - SUN[axis]!, dot - SUN[axis]!)).toBeLessThan(1e-9);
      });
    }
  });
});

/**
 * orbitRadPerPixel — unit tests for the altitude-damped orbit-drag rate.
 *
 * The behaviour worth pinning is the CLAIM the module's docstring makes:
 *
 *   1. Close to a pivot's surface, the rate is damped well below the flat
 *      cap — this is the whole point of the change (the flat rate was ~350x
 *      too fast at Earth's standoff floor).
 *   2. Far from a pivot (many body radii of altitude), the rate is
 *      indistinguishable from the flat cap — so deep "orbit a body from
 *      afar" feel is unchanged.
 *   3. With no pivot radius, the flat cap applies exactly, not
 *      approximately — the deep-space / no-focus path is untouched.
 *   4. The rate never exceeds the cap, however close or far the camera is.
 *
 * Not tested: the exact crossover altitude or a restatement of the formula
 * itself — those would just mirror the implementation.
 */

import { describe, it, expect } from 'vitest';

import { orbitRadPerPixel, ORBIT_MAX_RAD_PER_PX } from '../../../src/utils/camera/orbitRadPerPixel';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

/** Earth's mean radius (km → Mpc). */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
const FOV_Y_RAD = (Math.PI / 180) * 40;
const CSS_HEIGHT = 1000;

describe('orbitRadPerPixel', () => {
  it('damps well below the flat cap at a low-altitude standoff', () => {
    // 1.02 radii — ~127 km over Earth, well inside the damped regime.
    const distance = EARTH_RADIUS_MPC * 1.02;
    const rate = orbitRadPerPixel(FOV_Y_RAD, distance, CSS_HEIGHT, EARTH_RADIUS_MPC);

    // The flat rate at this altitude was ~350x too fast (see docstring); the
    // damped rate should be a small fraction of the cap, not just "less than".
    expect(rate).toBeLessThan(ORBIT_MAX_RAD_PER_PX / 50);
  });

  it('matches the flat cap far from the pivot (deep orbital feel is unchanged)', () => {
    const distance = EARTH_RADIUS_MPC * 1000;
    const rate = orbitRadPerPixel(FOV_Y_RAD, distance, CSS_HEIGHT, EARTH_RADIUS_MPC);

    expect(rate).toBeCloseTo(ORBIT_MAX_RAD_PER_PX, 6);
  });

  it('with no pivot radius, returns the flat cap exactly', () => {
    const rate = orbitRadPerPixel(FOV_Y_RAD, EARTH_RADIUS_MPC * 1.02, CSS_HEIGHT, null);
    expect(rate).toBe(ORBIT_MAX_RAD_PER_PX);
  });

  it('never exceeds the cap across a range of altitudes', () => {
    for (const radii of [1.02, 1.5, 2, 5, 7, 10, 100, 1e6]) {
      const rate = orbitRadPerPixel(
        FOV_Y_RAD,
        EARTH_RADIUS_MPC * radii,
        CSS_HEIGHT,
        EARTH_RADIUS_MPC,
      );
      expect(rate).toBeLessThanOrEqual(ORBIT_MAX_RAD_PER_PX);
    }
  });

  it('rate grows monotonically with altitude (drag gets less damped further out)', () => {
    const rates = [1.02, 1.1, 1.5, 2, 4, 7].map((radii) =>
      orbitRadPerPixel(FOV_Y_RAD, EARTH_RADIUS_MPC * radii, CSS_HEIGHT, EARTH_RADIUS_MPC),
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });
});

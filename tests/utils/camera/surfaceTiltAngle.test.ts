/**
 * The tilt probe's clamp, checked against the geometry it claims rather than
 * against its own formula: at the ceiling the aim must still find ground, and
 * a little past it must not.
 */

import { describe, it, expect } from 'vitest';

import { surfaceTiltAngle } from '../../../src/utils/camera/surfaceTiltAngle';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 6371 * SCALE_UNITS.KM_TO_MPC;
const CENTRE: Vec3 = [0, 0, 0];
/** Ground hit for an aim tilted `tilt` off nadir, from an eye at `altMpc`. */
function hitsGround(tilt: number, altMpc: number): boolean {
  const eye: Vec3 = [0, 0, R + altMpc];
  const dir: Vec3 = [0, Math.sin(tilt), -Math.cos(tilt)];
  const roots = raySphereRoots(eye, dir, CENTRE, R);
  return roots !== null && roots[0] > 0;
}

describe('surfaceTiltAngle', () => {
  it('stops at the horizon, which tightens with altitude', () => {
    // A drag far longer than the whole range, at two altitudes an order of
    // magnitude apart: both saturate, and the high one saturates much lower.
    for (const altKm of [100, 10000]) {
      const altMpc = altKm * SCALE_UNITS.KM_TO_MPC;
      const ceiling = surfaceTiltAngle(0, -100000, altMpc, R);
      expect(hitsGround(ceiling, altMpc), `ceiling at ${altKm} km`).toBe(true);
      expect(hitsGround(ceiling + 0.05, altMpc), `past ceiling at ${altKm} km`).toBe(false);
    }
    expect(surfaceTiltAngle(0, -100000, 10000 * SCALE_UNITS.KM_TO_MPC, R)).toBeLessThan(
      surfaceTiltAngle(0, -100000, 100 * SCALE_UNITS.KM_TO_MPC, R) / 2,
    );
  });

  it('cannot tilt back through nadir', () => {
    expect(surfaceTiltAngle(0, 40, 100 * SCALE_UNITS.KM_TO_MPC, R)).toBe(0);
  });
});

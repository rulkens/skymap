/**
 * The tilt probe's clamp. The horizon is checked as a landmark the sweep passes
 * THROUGH — geometry, via a real ground ray — and the zenith stop as the fold
 * guard it is.
 */

import { describe, it, expect } from 'vitest';

import { surfaceTiltAngle } from '../../../src/utils/camera/surfaceTiltAngle';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 6371 * SCALE_UNITS.KM_TO_MPC;
const CENTRE: Vec3 = [0, 0, 0];

/** Does an aim tilted `tilt` off nadir, from an eye at `altMpc`, find ground? */
function hitsGround(tilt: number, altMpc: number): boolean {
  const eye: Vec3 = [0, 0, R + altMpc];
  const dir: Vec3 = [0, Math.sin(tilt), -Math.cos(tilt)];
  const roots = raySphereRoots(eye, dir, CENTRE, R);
  return roots !== null && roots[0] > 0;
}

describe('surfaceTiltAngle', () => {
  it('carries on past the horizon and into the sky, at any altitude', () => {
    // 360 px up from nadir is 103°: past the 100 km horizon (80°), past the
    // 10 000 km one (23°), and past level. Not clamped at any of them — the
    // ground's limb is a landmark on the way, not a limit.
    const tilt = surfaceTiltAngle(0, -360);
    expect(hitsGround(tilt, 100 * SCALE_UNITS.KM_TO_MPC)).toBe(false);
    expect(hitsGround(tilt, 10000 * SCALE_UNITS.KM_TO_MPC)).toBe(false);
    expect(tilt).toBeGreaterThan(Math.PI / 2);
  });

  it('stops short of the zenith rather than folding back', () => {
    // `acos` cannot report past π, so a fold would read as the drag reversing.
    const far = surfaceTiltAngle(0, -100000);
    expect(far).toBeLessThan(Math.PI);
    expect(surfaceTiltAngle(far, -100000)).toBe(far);
  });

  it('cannot tilt back through nadir', () => {
    expect(surfaceTiltAngle(0, 40)).toBe(0);
  });
});

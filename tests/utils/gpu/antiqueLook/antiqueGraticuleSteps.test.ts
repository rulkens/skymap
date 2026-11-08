/**
 * antiqueGraticuleSteps — the rung is read off the frame's own coordinate: on
 * the sky longitude widens toward the pole, and a globe seen close is ruled on
 * its ground (much finer than the sky at the same lens), even when the view's
 * centre misses it.
 */

import { describe, it, expect } from 'vitest';

import { antiqueGraticuleSteps } from '../../../../src/utils/gpu/antiqueLook/antiqueGraticuleSteps';
import type { ViewBasis } from '../../../../src/@types/camera/projection/ViewBasis';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const FRUSTUM = { tanLeft: -1.0264, tanRight: 1.0264, tanDown: -0.5774, tanUp: 0.5774 };
const SIZE = { width: 1600, height: 900 };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const sky = { axes: IDENTITY, lonOffsetDeg: 0, globeCentre: null };
const steps = (frame: { globeCentre: Vec3 | null }, basis: ViewBasis) =>
  antiqueGraticuleSteps(
    { ...sky, ...frame },
    { kind: 'rectilinear', basis, frustum: FRUSTUM, size: SIZE },
    1,
  );

/** Looking at declination `decDeg` on RA 0, north up. */
function lookingAtDec(decDeg: number): ViewBasis {
  const d = (decDeg * Math.PI) / 180;
  return {
    forward: [Math.cos(d), 0, Math.sin(d)],
    right: [0, -1, 0],
    up: [-Math.sin(d), 0, Math.cos(d)],
  };
}

describe('antiqueGraticuleSteps', () => {
  it('rules the sky at equal intervals on the equator, wider in longitude near the pole', () => {
    const equator = steps({ globeCentre: null }, lookingAtDec(0));
    expect(equator.lon.stepDeg).toBe(equator.lat.stepDeg);
    const high = steps({ globeCentre: null }, lookingAtDec(70));
    expect(high.lon.stepDeg).toBeGreaterThan(high.lat.stepDeg);
  });

  it("rules a close globe on its ground, at the ray to its centre when the view's centre misses", () => {
    const skyRung = steps({ globeCentre: null }, lookingAtDec(0)).lat.stepDeg;
    // 1.05 radii out: looking straight down, then with the globe 100° to one side,
    // past its 72° angular radius, so the view's centre misses it.
    const below = steps({ globeCentre: [1.05, 0, 0] }, lookingAtDec(0)).lat.stepDeg;
    const a = (100 * Math.PI) / 180;
    const aside = steps(
      { globeCentre: [1.05 * Math.cos(a), -1.05 * Math.sin(a), 0] },
      lookingAtDec(0),
    );
    expect(below).toBeLessThan(skyRung);
    expect(aside.lat.stepDeg).toBe(below);
  });
});

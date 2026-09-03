/**
 * tiltFromNadirRad — the unsigned polar readout. The fold to a magnitude is
 * the load-bearing contract, not an accident: a pose tilted at the opposite
 * azimuth is byte-identical to a "crossed" one, so a pose-level readout has
 * no sign to give — round 13b measured that signing it breaks the ceiling
 * wall for legitimate opposite-azimuth look tilts. Signed questions belong
 * to `tiltFloorBudgetRad`, which has the rotation axis in hand.
 */

import { describe, it, expect } from 'vitest';

import { tiltFromNadirRad } from '../../../src/utils/camera/tiltFromNadirRad';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('tiltFromNadirRad', () => {
  it('reads the polar angle and folds both azimuth sides to one magnitude', () => {
    const eye: Vec3 = [0, 0, 2];
    const tau = 0.4;
    const toward: Vec3 = [0, Math.sin(tau), -Math.cos(tau)];
    const away: Vec3 = [0, -Math.sin(tau), -Math.cos(tau)];
    expect(tiltFromNadirRad(toward, eye)).toBeCloseTo(tau, 12);
    expect(tiltFromNadirRad(away, eye)).toBeCloseTo(tau, 12);
    expect(tiltFromNadirRad([0, 0, -1], eye)).toBe(0);
    // No nadir exists at the centre: 0, not NaN.
    expect(tiltFromNadirRad(toward, [0, 0, 0])).toBe(0);
  });
});

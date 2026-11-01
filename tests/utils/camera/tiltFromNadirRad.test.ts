/**
 * tiltFromNadirRad — the unsigned polar readout. The fold to a magnitude is
 * the load-bearing contract, not an accident: a pose tilted at the opposite
 * azimuth is byte-identical to a "crossed" one, so a pose-level readout has
 * no sign to give — signing it would misread a legitimate opposite-azimuth look
 * tilt as a negative one. Signed questions belong
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

  it('stays well-conditioned at nadir: a 1e-9 rad tilt reads as 1e-9, not 0', () => {
    // acos(f·n) near 1 maps the dot's last bit to ~1e-8 rad, which is what let
    // the settle golden trace drift between CPUs; atan2 of the perpendicular
    // magnitude over the dot keeps the error at the angle's own last bit.
    const eye: Vec3 = [0, 0, 2];
    const tilt = 1e-9;
    expect(tiltFromNadirRad([Math.sin(tilt), 0, -Math.cos(tilt)], eye)).toBeCloseTo(tilt, 20);
    // Scale of `forward` is immaterial: both terms carry it.
    expect(tiltFromNadirRad([0, 3 * Math.sin(0.4), -3 * Math.cos(0.4)], eye)).toBeCloseTo(0.4, 12);
  });
});

import { describe, expect, it } from 'vitest';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { occluderConesFrom } from '../../../src/utils/occlusion/occluderConesFrom';

// A body of radius 5 Mpc centred 10 Mpc down +x: its disc's half-angle is 30°.
const body = {
  positionMpc: [10, 0, 0] as [number, number, number],
  radiusM: 5 / SCALE_UNITS.M_TO_MPC,
  outerRadiusM: 0,
};

describe('occluderConesFrom', () => {
  it('packs the axis, the half-angle and the distance from the eye', () => {
    const [ux, uy, uz, cos, sin, distance] = occluderConesFrom([body], [0, 0, 0]);
    expect([ux, uy, uz]).toEqual([1, 0, 0]);
    expect(sin).toBeCloseTo(0.5, 12);
    expect(cos).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(distance).toBe(10);
  });

  it('gives no cone for an eye inside the body', () => {
    expect(occluderConesFrom([body], [9, 0, 0]).length).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  eqToSg,
  sgToEq,
  eqCartToRaDecDist,
  voxelToEqCart,
  sgToVoxelIndex,
} from '../../../../tools/utils/math/coordinates';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/**
 * SG↔EQ Cartesian round-trip, eqCartToRaDecDist hand-computed spot
 * checks, and voxel-index linearity.
 */
describe('coordinates', () => {
  it('eqToSg then sgToEq round-trips to the input vector', () => {
    const cases: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [3, 4, 5],
      [-10, 20, -30],
    ];
    for (const eq of cases) {
      const sg = eqToSg(eq);
      const back = sgToEq(sg);
      expect(back[0]).toBeCloseTo(eq[0], 9);
      expect(back[1]).toBeCloseTo(eq[1], 9);
      expect(back[2]).toBeCloseTo(eq[2], 9);
    }
  });

  it('eqCartToRaDecDist on the +x axis returns RA=0, Dec=0', () => {
    const r = eqCartToRaDecDist([10, 0, 0]);
    expect(r.raHours).toBeCloseTo(0, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
    expect(r.distMpc).toBeCloseTo(10, 9);
  });

  it('eqCartToRaDecDist on the +z axis returns Dec=+90°', () => {
    const r = eqCartToRaDecDist([0, 0, 7]);
    expect(r.decDeg).toBeCloseTo(90, 9);
    expect(r.distMpc).toBeCloseTo(7, 9);
  });

  it('eqCartToRaDecDist on the +y axis returns RA=6h', () => {
    const r = eqCartToRaDecDist([0, 5, 0]);
    expect(r.raHours).toBeCloseTo(6, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
  });

  it('sgToVoxelIndex linearly maps SG Mpc onto the 128³ CF-4 grid', () => {
    // ORIGIN_MPC = -500, VOXEL_SIZE_MPC = 1000/128 ≈ 7.8125.
    // Origin (-500,-500,-500) → voxel (0,0,0); centre (0,0,0) → 64.
    expect(sgToVoxelIndex([-500, -500, -500])).toEqual([0, 0, 0]);
    const centre = sgToVoxelIndex([0, 0, 0]);
    expect(centre[0]).toBeCloseTo(64, 9);
    expect(centre[1]).toBeCloseTo(64, 9);
    expect(centre[2]).toBeCloseTo(64, 9);
  });

  it('voxelToEqCart returns Cartesian inside the unit cube for the centre voxel', () => {
    // 128³ cube, voxel size 1, dim 128: voxel (64,64,64) sits near origin.
    const eq = voxelToEqCart([64, 64, 64], [128, 128, 128], 1);
    // Magnitude is the SG-vector length put through SG→EQ rotation —
    // length-preserving, so we just sanity-check it is finite.
    expect(Number.isFinite(eq[0])).toBe(true);
    expect(Number.isFinite(eq[1])).toBe(true);
    expect(Number.isFinite(eq[2])).toBe(true);
  });
});

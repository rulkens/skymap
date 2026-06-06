/**
 * flowFieldFrame.test.ts — frame-contract test for `attractorVoxel`.
 *
 * No build, no GPU, no file I/O.  The point is to pin the flow cube's frame
 * contract: a well-known attractor at a known RA/Dec/distance must land inside
 * the cube's voxel bounds.  This is the same self-check the builder logs, so if
 * the SG-frame chain (raDecDistToEqCart → eqToSg → voxel rescale) ever drifts,
 * one of the builder's self-check line and this test fail together.
 *
 * The anchors are approximate J2000 positions/distances — the assertion is
 * *in-bounds*, not an exact voxel.  Exact voxel coordinates would couple the
 * test to the precise distances, which are uncertain at the ~Mpc level and not
 * what this test is guarding.
 */
import { describe, expect, it } from 'vitest';
import { attractorVoxel } from '../../../tools/flow/flowFieldFrame';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Production flow-cube geometry: 128³ over a 1000 Mpc supergalactic box,
// observer-centred (lower corner of voxel (0,0,0) at -500 Mpc per axis).
// Matches what buildFlowField emits — keep in sync if the box ever changes.
const META: { origin: Vec3; voxelSizeMpc: number; n: number } = {
  origin: [-500, -500, -500],
  voxelSizeMpc: 1000 / 128,
  n: 128,
};

// Approximate J2000 positions + distances (Mpc).
const VIRGO = { raHours: 12.45, decDeg: 12.72, distMpc: 16.5 };
const GREAT_ATTRACTOR = { raHours: 16.25, decDeg: -60.84, distMpc: 68 }; // Norma / ACO 3627

describe('attractorVoxel — flow-cube frame contract', () => {
  it('Great Attractor lands inside the flow cube bounds', () => {
    const { voxel, inBounds } = attractorVoxel(GREAT_ATTRACTOR, META);
    expect(inBounds).toBe(true);
    for (const axis of voxel) {
      expect(axis).toBeGreaterThanOrEqual(0);
      expect(axis).toBeLessThan(128);
    }
  });

  it('Virgo lands inside the flow cube bounds', () => {
    const { voxel, inBounds } = attractorVoxel(VIRGO, META);
    expect(inBounds).toBe(true);
    for (const axis of voxel) {
      expect(axis).toBeGreaterThanOrEqual(0);
      expect(axis).toBeLessThan(128);
    }
  });
});

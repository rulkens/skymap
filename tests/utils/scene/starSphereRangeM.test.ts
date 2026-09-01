/**
 * starSphereRangeM — the camera-distance interval a drawn set of star
 * spheres spans, in metres (NEAR0's `distanceRangeM`, spec §7.1).
 */

import { describe, it, expect } from 'vitest';

import { starSphereRangeM } from '../../../src/utils/scene/starSphereRangeM';

describe('starSphereRangeM', () => {
  it('spans the drawn set, not the frustum', () => {
    // Two spheres on the +X axis, camera at the origin: the near member (1
    // Mpc, radius 1e15 m) sets the interval's low end, the far member (3 Mpc,
    // radius 2e15 m) sets the high end. Expected metres are hand-computed
    // (dMpc·MPC_TO_M ± radiusM), not re-derived from SCALE_UNITS in this test.
    const range = starSphereRangeM({
      spheres: [
        { positionMpc: [1, 0, 0], radiusM: 1e15 },
        { positionMpc: [3, 0, 0], radiusM: 2e15 },
      ],
      camPosMpc: [0, 0, 0],
    });
    expect(range).not.toBeNull();
    expect(range![0]).toBe(3.0856774814913673e22);
    expect(range![1]).toBe(9.257032944474102e22);
  });

  it('returns null for an empty set', () => {
    expect(starSphereRangeM({ spheres: [], camPosMpc: [0, 0, 0] })).toBeNull();
  });
});

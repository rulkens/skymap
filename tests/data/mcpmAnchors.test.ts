/**
 * MCPM tier anchors — anti-drift pin on origin and voxelSize for each tier.
 *
 * If a future maintainer re-runs `tools/extractMcpmCube.py` against a new
 * VAC release with different metadata, these assertions fail loudly
 * rather than silently shipping a misaligned cube. Mirrors the role of
 * `tools/auditCf4Anchors.ts` for CF-4.
 */
import { describe, it, expect } from 'vitest';
import {
  MCPM_BASE_DIMS,
  MCPM_BASE_VOXEL_EDGE_MPC,
  MCPM_GRID_CENTER_MPC,
  mcpmTierAnchors,
} from '../../tools/buildMcpmVolume';

describe('MCPM anchors', () => {
  it('base dims match export_metadata.txt', () => {
    expect(MCPM_BASE_DIMS).toEqual([712, 1200, 728]);
  });

  it('base voxel edge ≈ 0.78131 Mpc', () => {
    expect(MCPM_BASE_VOXEL_EDGE_MPC).toBeCloseTo(0.78131, 4);
  });

  it('grid center matches export_metadata.txt', () => {
    expect(MCPM_GRID_CENTER_MPC).toEqual([-239.469, -16.5618, 201.275]);
  });

  // Origin is grid_center - grid_size/2; tier-independent because
  // downsampling preserves the box extents.
  const expectedOrigin: [number, number, number] = [
    MCPM_GRID_CENTER_MPC[0] - 0.5 * MCPM_BASE_DIMS[0] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[1] - 0.5 * MCPM_BASE_DIMS[1] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[2] - 0.5 * MCPM_BASE_DIMS[2] * MCPM_BASE_VOXEL_EDGE_MPC,
  ];

  for (const factor of [8, 4, 2] as const) {
    it(`tier (factor=${factor}) inherits origin and scales voxel edge`, () => {
      const a = mcpmTierAnchors(factor);
      expect(a.origin[0]).toBeCloseTo(expectedOrigin[0], 3);
      expect(a.origin[1]).toBeCloseTo(expectedOrigin[1], 3);
      expect(a.origin[2]).toBeCloseTo(expectedOrigin[2], 3);
      expect(a.voxelSize).toBeCloseTo(MCPM_BASE_VOXEL_EDGE_MPC * factor, 6);
      expect(a.dims[0]).toBe(Math.round(MCPM_BASE_DIMS[0] / factor));
      expect(a.dims[1]).toBe(Math.round(MCPM_BASE_DIMS[1] / factor));
      expect(a.dims[2]).toBe(Math.round(MCPM_BASE_DIMS[2] / factor));
    });
  }
});

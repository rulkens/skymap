/**
 * MCPM anchors — anti-drift pin on the base cube's dims, voxel edge, and
 * grid center against `export_metadata.txt`.
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
} from '../../tools/volumes/buildMcpmVolume';

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
});

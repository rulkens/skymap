/**
 * Edenhofer dust anchors — cross-checks `dustTierAnchors`' derived
 * voxel sizes against the spec-quoted pc figures
 * (docs/superpowers/specs/2026-08-20-edenhofer-dust-volume.md: "128^3/256^3/384^3
 * ~= 19.5/9.8/6.5 pc voxels") and the box-consistency invariant
 * (dims * voxelSize spans exactly the Sun-centered +-1.25 kpc extent) —
 * catches a Mpc/kpc/pc conversion slip, not a restated constant.
 */
import { describe, it, expect } from 'vitest';
import { DUST_HALF_EXTENT_MPC, dustTierAnchors } from '../../tools/volumes/buildDustVolume';

const MPC_TO_PC = 1e6;

describe('Edenhofer dust anchors', () => {
  it.each([
    [128, 19.5],
    [256, 9.8],
    [384, 6.5],
  ] as const)('tier %i resolves to ~%s pc voxels', (res, expectedPc) => {
    const { voxelSize } = dustTierAnchors(res);
    expect(voxelSize * MPC_TO_PC).toBeCloseTo(expectedPc, 1);
  });

  it.each([128, 256, 384] as const)(
    'tier %i: dims * voxelSize spans the full +-1.25 kpc box from the given origin',
    (res) => {
      const { dims, origin, voxelSize } = dustTierAnchors(res);
      for (const [dim, org] of [
        [dims[0], origin[0]],
        [dims[1], origin[1]],
        [dims[2], origin[2]],
      ] as const) {
        expect(org).toBeCloseTo(-DUST_HALF_EXTENT_MPC, 12);
        expect(dim * voxelSize).toBeCloseTo(2 * DUST_HALF_EXTENT_MPC, 12);
      }
    },
  );
});

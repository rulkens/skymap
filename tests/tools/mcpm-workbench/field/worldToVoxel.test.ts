/**
 * worldToVoxel / voxelToWorld — the world-Mpc <-> grid-index affine. The box
 * below has origin = centerMpc - sizeMpc/2 = [-8,-8,-8] and voxelSizeMpc = 2,
 * chosen so every expected value is exact on paper.
 */
import { describe, expect, it } from 'vitest';
import { worldToVoxel } from '../../../../tools/mcpm-workbench/src/field/worldToVoxel';
import { voxelToWorld } from '../../../../tools/mcpm-workbench/src/field/voxelToWorld';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [16, 16, 16],
  dims: [8, 8, 8],
  voxelSizeMpc: 2,
  rotation: [0, 0, 0, 1],
};

describe('worldToVoxel', () => {
  it('lands a known Mpc position at a hand-computed voxel index', () => {
    // origin = [-8,-8,-8]; v = (p - origin) / 2.
    expect(worldToVoxel(box, [-2, -6, 2])).toEqual([3, 1, 5]);
  });

  it('applies a non-identity rotation about the box centre (spec §6)', () => {
    // 180deg about Y: quat = [0, sin(90deg), 0, cos(90deg)] = [0, 1, 0, 0]. A 180deg
    // rotation is its own inverse, so both R and worldToBoxLocal's R⁻¹ map
    // (x,y,z) -> (-x,y,-z). For the SAME p=[-2,-6,2] as the identity case above:
    // centered (center=[0,0,0]) = [-2,-6,2]; rotated = [2,-6,-2]; local = rotated +
    // half[8,8,8] = [10,2,6]; voxel = local / voxelSizeMpc(2) = [5,1,3] — x and z
    // swap ends relative to the identity case's [3,1,5], y is untouched.
    const rotatedBox: GridBox = { ...box, rotation: [0, 1, 0, 0] };
    expect(worldToVoxel(rotatedBox, [-2, -6, 2])).toEqual([5, 1, 3]);
  });
});

describe('voxelToWorld ∘ worldToVoxel', () => {
  it('returns the original position at voxel centres', () => {
    // p is the centre of voxel [2,3,4]: origin + (index + 0.5) * voxelSize.
    const p: [number, number, number] = [-3, -1, 1];
    const v = worldToVoxel(box, p);
    expect(v).toEqual([2.5, 3.5, 4.5]);
    expect(voxelToWorld(box, v)).toEqual(p);
  });
});

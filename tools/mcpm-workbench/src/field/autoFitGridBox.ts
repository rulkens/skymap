import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';

const ceil8 = (n: number): number => Math.ceil(n / 8) * 8;

/**
 * autoFitGridBox — fits a cubic-voxel simulation grid around a catalog bbox.
 *
 * Voxels are cubic and the box absorbs the rounding, never the reverse: rounding
 * dims up while pinning the box would leave per-axis voxel sizes differing by up
 * to 1.1% at a 728 axis, which fails buildRhizomeVolume's 0.5% spread assert —
 * an export rejected at the last step of a multi-hour fit. Multiple-of-8 dims
 * are required because the decay kernel dispatches dims/8 with no bounds tail.
 * A manual override is not a second constructor: it derives bounds from a
 * center+size and calls this function, so the invariant survives it.
 *
 * `paddingMpc` is real margin, not a voxel-size inflation: every axis's dims
 * derive from ITS OWN padded extent, so data stays ≥paddingMpc from every
 * face — deriving dims from the raw extent (padding only in voxelSizeMpc)
 * left short axes with just ceil8 slack, pinning data to the box faces.
 */
export function autoFitGridBox(
  bounds: { min: Vec3; max: Vec3 },
  longAxisTarget: number,
  paddingMpc: number,
): GridBox {
  const extent: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const longestExtent = Math.max(extent[0], extent[1], extent[2]);
  const voxelSizeMpc = (longestExtent + 2 * paddingMpc) / longAxisTarget;

  const dims: Vec3 = [
    ceil8((extent[0] + 2 * paddingMpc) / voxelSizeMpc),
    ceil8((extent[1] + 2 * paddingMpc) / voxelSizeMpc),
    ceil8((extent[2] + 2 * paddingMpc) / voxelSizeMpc),
  ];
  const sizeMpc: Vec3 = [dims[0] * voxelSizeMpc, dims[1] * voxelSizeMpc, dims[2] * voxelSizeMpc];
  const centerMpc: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];

  return { centerMpc, sizeMpc, dims, voxelSizeMpc };
}

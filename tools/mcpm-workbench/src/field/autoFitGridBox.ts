import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';

const ceil8 = (n: number): number => Math.ceil(n / 8) * 8;

/**
 * autoFitGridBox — fits a cubic-voxel simulation grid around a catalog bbox at
 * a given voxel size. `voxelSizeMpc` is an INPUT (the grid-voxel-size-currency
 * decision record, Q2): every axis's dims is `ceil8((extent + 2·padding) /
 * voxelSizeMpc)`, and the box absorbs the ceil8 rounding — sizeMpc grows to
 * dims × voxelSizeMpc exactly, so the returned voxelSizeMpc always equals the
 * requested one, no spread. Dims are multiples of 8: the decay kernel
 * dispatches dims/8 with no bounds tail. A manual override derives bounds
 * from a center+size and calls this function, so the invariant survives it.
 * `paddingMpc` is real per-axis margin — deriving dims from the raw extent
 * instead left short axes pinned to the box faces.
 */
export function autoFitGridBox(
  bounds: { min: Vec3; max: Vec3 },
  voxelSizeMpc: number,
  paddingMpc: number,
): GridBox {
  const extent: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];

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

  return { centerMpc, sizeMpc, dims, voxelSizeMpc, rotation: [0, 0, 0, 1] };
}

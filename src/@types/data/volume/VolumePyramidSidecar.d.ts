import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { ScalarFieldFrameKind } from '../../../../packages/shared/src/@types/data/volume/ScalarFieldFrameKind';

/** The pyramid's JSON file (one per field, beside its level files). */
export type VolumePyramidSidecar = {
  /** Native grid, voxels (x, y, z). Level k's voxel is 2^k native voxels on a side. */
  readonly gridDims: Vec3;
  readonly voxelMpc: number;
  /** World position of native voxel (0,0,0)'s low corner, in `frame`, Mpc. */
  readonly originMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  /** The stored box inside the native grid, native voxels. */
  readonly dataBox: { readonly originVox: Vec3; readonly dims: Vec3 };
  /** Raw peak of each whole block-mean level; index = level, 0 = native. [0] is the encoding scale. */
  readonly levelMax: readonly [number, number, number, number];
};

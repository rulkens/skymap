import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';

export type DetailRegionGeometry = {
  /** The dataBox, native voxels. */
  readonly dims: Vec3;
  /** K. */
  readonly bricksPerAxis: number;
  /** The sidecar's native voxel edge, Mpc. */
  readonly voxelMpc: number;
};

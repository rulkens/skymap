/** What `buildCubeModelMatrix` needs to place a voxel cube in world space: narrow, so a volume
 *  (`GpuVolume.placement`) and the axis-aligned flow field (identity rotation) both build one. */
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { Vec4 } from '../../../packages/shared/src/@types/math/Vec4';
import type { ScalarFieldFrameKind } from '../../../packages/shared/src/@types/data/volume/ScalarFieldFrameKind';

export type CubePlacement = {
  readonly frameKind: ScalarFieldFrameKind;
  /** Unit quaternion (x, y, z, w) applied in the native frame. */
  readonly rotation: Vec4;
  /** Position of the voxel (0,0,0) corner in `frameKind` coords, Mpc. */
  readonly origin: Vec3;
  /** Edge length of one cubic voxel, Mpc. */
  readonly voxelSize: number;
  readonly dims: Vec3;
};

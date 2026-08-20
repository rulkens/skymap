import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { worldToBoxLocal } from './worldToBoxLocal';

/**
 * World Mpc -> continuous grid-index space, the frame agent positions and
 * grid.wesl's sampleTrace share: voxel i covers [i, i+1), centred at i+0.5.
 * A uniform scale of worldToBoxLocal's box-local frame, so rotation (applied
 * there) carries through unchanged.
 */
export function worldToVoxel(box: GridBox, p: Vec3): Vec3 {
  const local = worldToBoxLocal(box, p);
  return [local[0] / box.voxelSizeMpc, local[1] / box.voxelSizeMpc, local[2] / box.voxelSizeMpc];
}

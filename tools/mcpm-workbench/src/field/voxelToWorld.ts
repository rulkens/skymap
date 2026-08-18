import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';
import { boxLocalToWorld } from './boxLocalToWorld';

/** Grid-index space -> world Mpc — the independent inverse of worldToVoxel, not its mirror. */
export function voxelToWorld(box: GridBox, v: Vec3): Vec3 {
  const local: Vec3 = [v[0] * box.voxelSizeMpc, v[1] * box.voxelSizeMpc, v[2] * box.voxelSizeMpc];
  return boxLocalToWorld(box, local);
}

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';

/** Grid-index space -> world Mpc — the independent inverse of worldToVoxel, not its mirror. */
export function voxelToWorld(box: GridBox, v: Vec3): Vec3 {
  const origin: Vec3 = [
    box.centerMpc[0] - box.sizeMpc[0] / 2,
    box.centerMpc[1] - box.sizeMpc[1] / 2,
    box.centerMpc[2] - box.sizeMpc[2] / 2,
  ];
  return [
    origin[0] + v[0] * box.voxelSizeMpc,
    origin[1] + v[1] * box.voxelSizeMpc,
    origin[2] + v[2] * box.voxelSizeMpc,
  ];
}

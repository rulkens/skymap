import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';

/**
 * World Mpc -> continuous grid-index space, the frame agent positions and
 * grid.wesl's sampleTrace share: voxel i covers [i, i+1), centred at i+0.5.
 * origin is the lower corner of voxel (0,0,0) — matches the sidecar's origin_mpc.
 */
export function worldToVoxel(box: GridBox, p: Vec3): Vec3 {
  const origin: Vec3 = [
    box.centerMpc[0] - box.sizeMpc[0] / 2,
    box.centerMpc[1] - box.sizeMpc[1] / 2,
    box.centerMpc[2] - box.sizeMpc[2] / 2,
  ];
  return [
    (p[0] - origin[0]) / box.voxelSizeMpc,
    (p[1] - origin[1]) / box.voxelSizeMpc,
    (p[2] - origin[2]) / box.voxelSizeMpc,
  ];
}

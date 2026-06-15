/**
 * Integer voxel index → Equatorial Cartesian (Mpc), centring the voxel
 * by adding 0.5 to each axis before rescaling.
 *
 * Inverts `sgToVoxelIndex` for an arbitrary cube (dims + voxelSize
 * supplied by the caller) and rotates the resulting SG position back into
 * the equatorial frame via `sgToEq`.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { sgToEq } from './sgToEq';

export function voxelToEqCart(vox: Vec3, dims: Vec3, voxelSize: number): Vec3 {
  const sgX = (vox[0] - dims[0] / 2 + 0.5) * voxelSize;
  const sgY = (vox[1] - dims[1] / 2 + 0.5) * voxelSize;
  const sgZ = (vox[2] - dims[2] / 2 + 0.5) * voxelSize;
  return sgToEq([sgX, sgY, sgZ]);
}

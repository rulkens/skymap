/**
 * SG Cartesian (Mpc) → continuous voxel indices in the CF-4 cube's
 * native numpy axis order.  Linear: corner 0 at −500 Mpc, corner 128
 * at +500 Mpc.
 *
 * The CF-4-specific origin and voxel-size constants live here rather than
 * in src/ because they are coupled to the CF-4 catalog box specifically
 * (128³, ±500 Mpc) — moving them into src/ would suggest runtime use, of
 * which there is none.  If a second volume needs a similar helper we'd
 * parameterise; hard-coding keeps the call sites short.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';

const CF4_VOXEL_SIZE_MPC = 1000 / 128;
const CF4_DIMS = 128;
const CF4_ORIGIN_MPC = -CF4_VOXEL_SIZE_MPC * (CF4_DIMS / 2); // -500 Mpc

export function sgToVoxelIndex(sg: Vec3): Vec3 {
  return [
    (sg[0] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[1] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[2] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
  ];
}

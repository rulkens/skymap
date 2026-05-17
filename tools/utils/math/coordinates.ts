/**
 * Equatorial ↔ Supergalactic Cartesian conversions, plus the
 * SG-Mpc → CF-4 voxel-index helper used by the CF-4 diagnostics
 * (auditCf4Anchors, verifyCf4Scfd).
 *
 * Why duplicate the CF-4-specific origin and voxel-size constants
 * here rather than import them from src/?  They are coupled to the
 * CF-4 catalog box specifically (128³, ±500 Mpc) — moving them into
 * src/ would suggest runtime use, which there is none.  If a second
 * volume needs a similar helper we'd parameterise; right now hard-
 * coding keeps the call sites short.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SG_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';
import { applyMat3, transpose3 } from './mat3';

const EQ_TO_SG_MATRIX = transpose3(SG_TO_EQ_MATRIX);

const CF4_VOXEL_SIZE_MPC = 1000 / 128;
const CF4_DIMS = 128;
const CF4_ORIGIN_MPC = -CF4_VOXEL_SIZE_MPC * (CF4_DIMS / 2); // -500 Mpc

/** Equatorial Cartesian (Mpc) → Supergalactic Cartesian (Mpc). */
export function eqToSg(eq: Vec3): Vec3 {
  return applyMat3(EQ_TO_SG_MATRIX, eq);
}

/** Supergalactic Cartesian (Mpc) → Equatorial Cartesian (Mpc). */
export function sgToEq(sg: Vec3): Vec3 {
  return applyMat3(SG_TO_EQ_MATRIX, sg);
}

/** Equatorial Cartesian → (RA hours, Dec deg, distance Mpc). */
export function eqCartToRaDecDist(eq: Vec3): {
  raHours: number;
  decDeg: number;
  distMpc: number;
} {
  const d = Math.hypot(eq[0], eq[1], eq[2]);
  const decDeg = (Math.asin(eq[2] / d) * 180) / Math.PI;
  let raDeg = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { raHours: raDeg / 15, decDeg, distMpc: d };
}

/**
 * SG Cartesian (Mpc) → continuous voxel indices in the CF-4 cube's
 * native numpy axis order.  Linear: corner 0 at -500 Mpc, corner 128
 * at +500 Mpc.
 */
export function sgToVoxelIndex(sg: Vec3): Vec3 {
  return [
    (sg[0] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[1] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[2] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
  ];
}

/**
 * Integer voxel index → Equatorial Cartesian (Mpc), centring the
 * voxel by adding 0.5 to each axis before rescaling.
 */
export function voxelToEqCart(vox: Vec3, dims: Vec3, voxelSize: number): Vec3 {
  const sgX = (vox[0] - dims[0] / 2 + 0.5) * voxelSize;
  const sgY = (vox[1] - dims[1] / 2 + 0.5) * voxelSize;
  const sgZ = (vox[2] - dims[2] / 2 + 0.5) * voxelSize;
  return sgToEq([sgX, sgY, sgZ]);
}

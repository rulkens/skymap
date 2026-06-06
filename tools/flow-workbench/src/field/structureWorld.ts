/**
 * structureWorld — map an ICRS sky position + distance to the world cube.
 *
 * This replaces the spike's hand-rolled ICRS→Galactic→Supergalactic rotation
 * matrices with the repo's verified transform: `eqToSg` (tools/utils/math/
 * coordinates) IS the same rotation the spike used (confirmed to agree to the
 * decimal), so we reuse it rather than carry a second copy of two 3×3 matrices.
 *
 * What stays tool-local is the CF4++ BOX MAPPING, because the shared
 * `sgToVoxelIndex` helper uses a different convention (no Hubble-h, voxel-centre
 * at index 64, ±500 Mpc) than the placement that was cross-match-verified
 * against this particular reconstruction. The verified mapping, reproduced here:
 *
 *   1. RA/Dec/dist (physical Mpc) → equatorial Cartesian → `eqToSg` → SG-Mpc.
 *   2. SG-Mpc → voxel index: multiply by the reconstruction's assumed Hubble h
 *      (the box is 1 Gpc/h, distances are physical Mpc, so D[Mpc/h] = D[Mpc]·h),
 *      divide by the voxel size, and centre at index 63.5.
 *   3. Voxel index → centred world cube [-1,1] by `idx/127 - 0.5, ×2`.
 *
 * The world AXIS ORDER (world x←SGZ, y←SGY, z←SGX) mirrors how the field texture
 * is uploaded + sampled, so a label sits exactly where the corresponding voxel
 * renders. Reproduced verbatim from the spike so labels and flow stay aligned.
 *
 * `CF4PP_HUBBLE_H` is the reconstruction's assumed h that made every massive
 * cluster land on a δ>1 knot in the spike's cross-match — the empirical anchor,
 * not a cosmological constant to be "corrected".
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { eqToSg } from '../../../../tools/utils/math/coordinates';

export const CF4PP_HUBBLE_H = 0.77;
const VOXEL_SIZE_MPC_PER_H = 1000 / 128; // CF4++ box: 1 Gpc/h across 128 voxels
const CENTRE_INDEX = 63.5; // SG origin sits at voxel index 63.5
const MAX_INDEX = 127; // normalisation denominator (voxel [0,127] → [0,1])

const RAD = Math.PI / 180;

export function structureWorld(raDeg: number, decDeg: number, distMpc: number): Vec3 {
  if (distMpc === 0) return [0, 0, 0];

  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  const eq: Vec3 = [
    Math.cos(dec) * Math.cos(ra) * distMpc,
    Math.cos(dec) * Math.sin(ra) * distMpc,
    Math.sin(dec) * distMpc,
  ];
  const sg = eqToSg(eq);

  const toIndex = (sgComponent: number): number =>
    CENTRE_INDEX + (sgComponent * CF4PP_HUBBLE_H) / VOXEL_SIZE_MPC_PER_H;
  const i = toIndex(sg[0]); // SGX
  const j = toIndex(sg[1]); // SGY
  const k = toIndex(sg[2]); // SGZ

  const toWorld = (index: number): number => (index / MAX_INDEX - 0.5) * 2;
  // world x←SGZ (k), y←SGY (j), z←SGX (i) — matches the texture upload + sampling.
  return [toWorld(k), toWorld(j), toWorld(i)];
}

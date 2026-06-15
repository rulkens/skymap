/**
 * Supergalactic Cartesian (Mpc) → Equatorial Cartesian (Mpc) — the
 * inverse of `eqToSg`.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { applyMat3 } from './applyMat3';
import { SG_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';

export function sgToEq(sg: Vec3): Vec3 {
  return applyMat3(SG_TO_EQ_MATRIX, sg);
}

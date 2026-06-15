/**
 * Equatorial Cartesian (Mpc) → Supergalactic Cartesian (Mpc).
 *
 * Used by the CF-4 / flow diagnostics to map sky positions into the
 * supergalactic frame the volume cubes are defined in.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { applyMat3 } from './applyMat3';
import { EQ_TO_SG_MATRIX } from './eqToSgMatrix';

export function eqToSg(eq: Vec3): Vec3 {
  return applyMat3(EQ_TO_SG_MATRIX, eq);
}

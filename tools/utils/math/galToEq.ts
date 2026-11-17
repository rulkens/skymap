/**
 * Galactic Cartesian → equatorial Cartesian (any unit): x towards the Galactic Centre, y towards
 * l = 90°, z to the north galactic pole, rotated into skymap's J2000 equatorial world frame.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { GAL_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';
import { applyMat3 } from './applyMat3';

export function galToEq(v: Readonly<Vec3>): Vec3 {
  return applyMat3(GAL_TO_EQ_MATRIX, [v[0], v[1], v[2]]);
}

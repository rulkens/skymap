import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** The `sizeMpc / 2` primitive every box-origin computation shares — see the
 * transform pair (worldToBoxLocal.ts) and its non-pair callers. */
export function boxHalfExtentMpc(sizeMpc: Readonly<Vec3>): Vec3 {
  return [sizeMpc[0] / 2, sizeMpc[1] / 2, sizeMpc[2] / 2];
}

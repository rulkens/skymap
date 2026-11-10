import type { Vec3 } from '../../../../../@types/math/Vec3';

/** Isotropic sprites don't need an oriented frame — any orthonormal basis gives the same M when all three sigmas match. */
export const ISO_FRAME = {
  along: [1, 0, 0] as Vec3,
  across: [0, 1, 0] as Vec3,
  pole: [0, 0, 1] as Vec3,
};

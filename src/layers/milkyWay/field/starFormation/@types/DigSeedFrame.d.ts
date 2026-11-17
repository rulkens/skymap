import type { Vec3 } from '../../../../../@types/math/Vec3';

/**
 * A DIG/association complex's local flow-direction frame — the azimuthal
 * tangent (`warpSurfaceFrame`), the default "flow direction" since both
 * tiers shear azimuthally. Flat reference height (`point[1] = 0`); the true
 * warp lift is applied per CHILD below, at that child's own (x, z), not
 * baked into the seed.
 */
export type DigSeedFrame = {
  readonly point: Vec3;
  readonly along: Vec3;
  readonly across: Vec3;
  readonly pole: Vec3;
};

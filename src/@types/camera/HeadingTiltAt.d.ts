import type { Vec3 } from '../math/Vec3';

/**
 * Heading/tilt of a forward/up pair in the ENU at a given local-vertical
 * point — KML LookAt convention: `tiltRad` from local nadir (0 = straight
 * down), `headingRad` from north toward east. `east`/`north` are returned
 * alongside since callers that rebuild a basis from `(heading, tilt)` need
 * the same ENU axes the extraction used.
 */
export type HeadingTiltAt = {
  readonly headingRad: number;
  readonly tiltRad: number;
  readonly east: Vec3;
  readonly north: Vec3;
};

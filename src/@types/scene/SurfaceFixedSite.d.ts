/**
 * SurfaceFixedSite — a body parked at a fixed point on another body's surface:
 * a landing site rather than an orbit. The host spins under the IAU prime
 * meridian, so the site's world position is time-varying even though its
 * body-fixed coordinates are not.
 */

export type SurfaceFixedSite = {
  readonly id: string;
  readonly hostId: string;
  /** Planetocentric latitude, degrees. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees, on the host's IAU body-fixed frame. */
  readonly lonDeg: number;
  /** Height above the host's mean sphere, metres. */
  readonly altitudeM: number;
};

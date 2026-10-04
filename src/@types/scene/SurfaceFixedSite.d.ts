/**
 * SurfaceFixedSite — a body parked at a fixed point on another body's surface:
 * a landing site rather than an orbit. The host spins under the IAU prime
 * meridian, so the site's world position is time-varying even though its
 * body-fixed coordinates are not.
 */

import type { MeshSeatKind } from './MeshSeatKind';

export type SurfaceFixedSite = {
  readonly id: string;
  readonly hostId: string;
  /** Latitude, degrees — planetocentric on Mars; geodetic (WGS84) on Earth, which the Earth tiles map straight onto the sphere. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees, on the host's IAU body-fixed frame. */
  readonly lonDeg: number;
  /** Height above the host's mean sphere, metres. */
  readonly altitudeM: number;
  readonly seat: MeshSeatKind;
};

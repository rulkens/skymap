/**
 * CameraRide — the flyby the ride camera is framing. `normal` is fixed per event (the encounter
 * plane's normal, equatorial world) so the view does not swing as the craft bends; `offsets` are
 * the visitor's orbit and zoom inside that frame and reset on every step.
 */

import type { Vec3 } from '../math/Vec3';

export type CameraRide = {
  readonly eventId: string;
  readonly craftId: string;
  readonly targetId: string;
  readonly closestKm: number;
  readonly normal: Vec3;
  readonly offsets: {
    readonly yaw: number;
    readonly pitch: number;
    readonly zoom: number;
  };
};

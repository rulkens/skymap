/**
 * InitialCam — snapshot of the camera's initial framing values.
 *
 * Captured once at engine startup (after the cloud bbox is known) so the
 * public `resetCamera()` handle method can restore it later.  `aspect` is
 * deliberately *not* included — reset uses the live canvas aspect ratio so
 * the projection stays correct after a window resize.
 *
 * Produced by `computeInitialCamera` in
 * `src/services/engine/camera/cameraFraming.ts`.
 */

import type { Vec3 } from '../math/Vec3';

export type InitialCam = {
  target: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  fovYRad: number;
  near: number;
  far: number;
};

import type { SkySpot } from '../camera/pose/SkySpot';

/**
 * The live standing view, rounded to `SKY_VIEW_STEP_RAD` (azimuth in [0, 2π)); null whenever the
 * camera frame is not `sky`. `fovYRad` is rounded too: the HUD reads the live lens from
 * `camera.fovYRad`.
 */
export type SkyView = {
  readonly spot: SkySpot;
  readonly azimuthRad: number;
  readonly altitudeRad: number;
  readonly fovYRad: number;
} | null;

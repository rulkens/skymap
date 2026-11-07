import type { SkySpot } from '../camera/pose/SkySpot';

/** The live standing view, rounded to `SKY_VIEW_STEP_RAD`; null whenever the camera frame is not `sky`. */
export type SkyView = {
  readonly spot: SkySpot;
  readonly azimuthRad: number;
  readonly altitudeRad: number;
  readonly fovYRad: number;
} | null;

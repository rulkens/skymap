import type { Vec2 } from '../math/Vec2';

/**
 * Per-image placement calibration for a famous-galaxy WebP thumbnail.
 *
 * All values describe the *final shipped WebP* in normalised image
 * coordinates so they are independent of atlas slot size or on-screen
 * scale.  When absent the render path falls back to catalog geometry,
 * which is the correct behaviour for the vast majority of entries.
 */
export type FamousCalibration = {
  /** Nucleus position normalised [0,1]^2 within the WebP (0.5, 0.5 = centre). */
  center: Vec2;
  /** Disk radius as a fraction of the image half-width. */
  diskRadiusFrac: number;
  /** Major-axis PA in the final image frame, degrees [0, 180). */
  paDeg: number;
  /** b/a override; absent → catalog axisRatio is used instead. */
  axisRatio?: number;
  /** True when the shipped WebP was deprojected to face-on. */
  deprojected: boolean;
};

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
  /**
   * True when the shipped WebP was deprojected to face-on.  This is the
   * calibration's ONLY orientation input: a deprojected texture re-projects
   * correctly on the galaxy's real catalog plane (on-sky PA + inclination),
   * while an as-shot texture already carries Earth's projection and renders
   * face-on to the sky.  The disk's 3D orientation itself always comes from
   * the catalog — the calibration never carries an angle or an axis ratio.
   */
  deprojected: boolean;
};

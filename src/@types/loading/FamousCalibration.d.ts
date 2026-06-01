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
   * Major-axis angle of the disk WITHIN the final WebP frame, degrees
   * [0, 180) — NOT an on-sky position angle.  It is ≡ 0 for any deprojected
   * thumbnail (the crop is rotated to axis-align the disk before the face-on
   * stretch), and only nonzero for an as-shot thumbnail whose crop wasn't
   * rotated to the disk.  The on-sky PA used to orient the disk in 3D comes
   * from the catalog, never from this field — feeding this into a sky-PA
   * basis would tilt the disk along an image axis, not the real sky axis.
   */
  frameMajorAxisDeg: number;
  /** b/a override; absent → catalog axisRatio is used instead. */
  axisRatio?: number;
  /** True when the shipped WebP was deprojected to face-on. */
  deprojected: boolean;
};

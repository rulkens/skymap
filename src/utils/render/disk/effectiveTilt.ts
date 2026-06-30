/**
 * effectiveTilt — pure placement-math for the tilt (PA + axis ratio) a
 * famous-galaxy thumbnail should render with.
 *
 * A shipped WebP may have been deprojected to face-on (so the catalog's
 * measured inclination doesn't apply to it). Orientation is owned by the
 * CATALOG, never by the image frame — this helper only decides which of
 * two regimes the calibration selects. It is deliberately pure (no GPU,
 * no state) so it can be unit-tested exactly and reused from the
 * textured-disk subsystem without dragging in renderer plumbing.
 */

import type { FamousCalibration } from '../../../@types/loading/FamousCalibration';

/**
 * Effective tilt (PA + axis ratio) the disk should render with.
 *
 * Orientation is owned by the CATALOG, never by the image frame.  The
 * calibration only decides *which* of two regimes applies:
 *   - deprojected WebP: the image was warped to face-on, so the texture
 *     re-projects correctly when mapped onto the galaxy's real world-fixed
 *     plane.  The disk renders with the catalog's on-sky PA + inclination —
 *     byte-identical to the procedural and uncalibrated paths, which is what
 *     unifies the three disk renderers on one orientation source.
 *   - as-shot WebP: the image already carries the galaxy's real inclination,
 *     so the disk must face the sky plane (axisRatio 1, PA 0) — re-tilting
 *     would double the projection.  No as-shot thumbnail exists today; the
 *     branch is retained for forward-compat with a deproject-off curation.
 *
 * Why the catalog PA is a parameter rather than read from the calibration:
 * the calibration's image-frame angle is meaningless in 3D (it is the disk's
 * major-axis angle WITHIN the WebP, ≡ 0 for a deprojected crop).  The on-sky
 * PA that orients `diskAxes` comes from the catalog.
 */
export function effectiveTilt(
  calibration: FamousCalibration,
  catalogAxisRatio: number,
  catalogPaDeg: number,
): { positionAngleDeg: number; axisRatio: number } {
  if (calibration.deprojected) {
    return { positionAngleDeg: catalogPaDeg, axisRatio: catalogAxisRatio };
  }
  return { positionAngleDeg: 0, axisRatio: 1 };
}

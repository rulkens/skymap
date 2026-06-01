/**
 * famousPlacement — pure placement-math for famous-galaxy thumbnails.
 *
 * A famous-galaxy WebP is a hand-curated, possibly cropped/deprojected
 * image of one galaxy.  The catalog gives us a 3-D world position and a
 * size in world units that the *disk of the galaxy* should span.  But a
 * shipped WebP frames its disk arbitrarily: the disk may fill only part
 * of the frame (`diskRadiusFrac < 1`), the nucleus may sit off-centre
 * (`center != [0.5, 0.5]`), and the image may have been deprojected to
 * face-on (so the catalog's measured inclination no longer applies).
 *
 * These three helpers translate the curated calibration into the disk's
 * render frame.  They are deliberately pure (no GPU, no state) so they
 * can be unit-tested exactly and reused from the textured-disk subsystem
 * without dragging in renderer plumbing.
 *
 * Why split size / offset / tilt into three functions rather than one
 * "place" call: each answers an independent question (how big, where,
 * how squashed), each has its own degenerate-input guard, and the disk
 * subsystem composes them with the camera basis it already has on hand.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FamousCalibration } from '../../../@types/loading/FamousCalibration';

/**
 * World-space size for the *disk* (not the framed image) so the disk
 * spans the catalog's intended `diameterKpc`.
 *
 * The WebP frame is the rendered quad; `diskRadiusFrac` says how much of
 * that frame the actual disk occupies.  If the disk fills the frame
 * (`frac == 1`) the quad size already equals the catalog size.  If the
 * disk only half-fills the frame (`frac == 0.5`) we must render the quad
 * twice as large so the disk inside it still spans the catalog size.
 * Hence `catalogSizeWorld / diskRadiusFrac`.
 *
 * Guard: `deriveFamousCalibration` never emits a non-positive frac, so a
 * zero or negative value is malformed input rather than a real case.  We
 * return `catalogSizeWorld` unchanged (the disk-fills-frame default)
 * rather than producing `Infinity`/`NaN` from a div-by-zero — that keeps
 * a bad record visible-but-sane instead of blowing up the whole frame.
 */
export function calibratedDiskSizeWorld(
  catalogSizeWorld: number,
  diskRadiusFrac: number,
): number {
  if (diskRadiusFrac <= 0) return catalogSizeWorld;
  return catalogSizeWorld / diskRadiusFrac;
}

/**
 * World offset that slides the disk so its nucleus lands on the catalog
 * 3-D point.
 *
 * The disk quad is positioned by its *centre*: its render position is the
 * geometric centre of the WebP frame, and the quad spans `±diskSizeWorld/2`
 * along the screen-aligned `right`/`up` basis.  The nucleus, however, sits
 * at the normalised `center` within the frame.  To make the *nucleus* (not
 * the frame centre) coincide with the catalog point, we shift the whole
 * quad by the negated nucleus-delta:
 *
 *   delta   = center - [0.5, 0.5]           // nucleus offset from frame centre, in [-0.5, 0.5]
 *   scaled  = delta * diskSizeWorld          // half-frame delta 0.5 -> diskSizeWorld/2
 *   world   = scaled.x * right + scaled.y * up
 *   offset  = -world                          // move the quad so the nucleus reaches the point
 *
 * The negation is the crux: if the nucleus is LEFT of frame centre
 * (`center.x < 0.5`, delta.x < 0), keeping the quad centred would leave
 * the nucleus left of the catalog point; we must push the quad RIGHT by
 * the same amount so the nucleus arrives on the point.  Negating the
 * delta does exactly that.  A centred nucleus (`[0.5, 0.5]`) yields a
 * zero delta and therefore a zero offset.
 *
 * `right`/`up` are taken `Readonly` — this function never mutates the
 * camera basis it's handed.
 */
export function nucleusOffsetWorld(
  center: Vec2,
  diskSizeWorld: number,
  right: Readonly<Vec3>,
  up: Readonly<Vec3>,
): Vec3 {
  const dx = center[0] - 0.5;
  const dy = center[1] - 0.5;

  const sx = dx * diskSizeWorld;
  const sy = dy * diskSizeWorld;

  // Negated projection onto the screen-aligned basis: slide the quad so
  // its nucleus (not its frame centre) reaches the catalog point.  The
  // trailing `+ 0` normalises IEEE-754 negative zero (a zero component
  // emerges from the unary negation as `-0`, which is numerically a no-op
  // but compares unequal to `0` under Object.is — `-0 + 0` is `+0`).
  return [
    -(sx * right[0] + sy * up[0]) + 0,
    -(sx * right[1] + sy * up[1]) + 0,
    -(sx * right[2] + sy * up[2]) + 0,
  ];
}

/**
 * Effective tilt (PA + axis ratio) the disk should render with.
 *
 * Two curated regimes:
 *   - deprojected WebP: the image was warped to face-on, so we re-apply a
 *     single correct squash from the calibration's PA and axis ratio.
 *     The axis ratio falls back to the catalog's measured value when the
 *     calibration doesn't override it.
 *   - as-shot WebP: the image already carries the galaxy's real
 *     inclination, so the disk must render *flat* (axisRatio 1, PA 0) —
 *     applying another squash would double the projection.
 */
export function effectiveTilt(
  calibration: FamousCalibration,
  catalogAxisRatio: number,
): { positionAngleDeg: number; axisRatio: number } {
  if (calibration.deprojected) {
    return {
      positionAngleDeg: calibration.paDeg,
      axisRatio: calibration.axisRatio ?? catalogAxisRatio,
    };
  }
  return { positionAngleDeg: 0, axisRatio: 1 };
}

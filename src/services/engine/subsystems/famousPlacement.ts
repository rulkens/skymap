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
 * Why split size / nucleus / tilt into three functions rather than one
 * "place" call: each answers an independent question (how big, where the
 * nucleus sits, how squashed), each has its own degenerate-input guard,
 * and the disk subsystem composes them per row.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
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
export function calibratedDiskSizeWorld(catalogSizeWorld: number, diskRadiusFrac: number): number {
  if (diskRadiusFrac <= 0) return catalogSizeWorld;
  return catalogSizeWorld / diskRadiusFrac;
}

/**
 * Nucleus position mapped from normalised WebP coordinates into the
 * disk's LOCAL corner frame ([-1, +1]²).
 *
 * The disk quad's corners run [-1, +1]² in the disk plane; the vertex
 * shader places each corner via the (major, minor) basis it derives on
 * the GPU.  The nucleus sits at the normalised `center` within the WebP
 * (y-down, [0.5, 0.5] = frame centre).  Mapping it into the same corner
 * frame lets the shader subtract it from every corner (`corner - nucleus`),
 * which slides the quad so the *nucleus* — not the frame centre — lands on
 * the catalog 3-D point.  Doing the subtraction in the shader's own basis
 * means there is no CPU-side world basis to reconstruct (and no chance of
 * it diverging from the GPU's).
 *
 *   corner = center * 2 - 1
 *
 * A centred nucleus (`[0.5, 0.5]`) maps to `[0, 0]` — the uncalibrated
 * default that leaves the quad unshifted.
 *
 * No v-flip is applied: the atlas uploads top-down (`flipY: false`) and
 * the shader remaps `corner.y = webp-v * 2 - 1` in the SAME direction, so
 * webp-top (v = 0) and corner.y = -1 already coincide.  Flipping here
 * would un-pair them.
 */
export function nucleusCorner(center: Vec2): Vec2 {
  return [center[0] * 2 - 1, center[1] * 2 - 1];
}

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

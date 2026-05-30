/**
 * deriveFamousCalibration — source-px disk annotation → normalised runtime
 * calibration for the final shipped WebP.
 *
 * The curator annotates galaxy disks in SOURCE-image pixels (before any crop
 * or rotation is applied).  The export pipeline crops a square region from
 * the source, optionally at a rotation angle.  This function maps the source-px
 * disk geometry into the coordinate frame of the final WebP so the renderer
 * can overlay the disk overlay without knowing anything about the crop.
 *
 * Geometry summary (all in y-down screen coordinates):
 *
 *   1. Translate disk.centerPx relative to the crop centre.
 *   2. Apply R(-rotationDeg) — the same inverse-rotation the crop extractor
 *      uses (see cropExtract.ts lines 77-84) — to get local crop-frame coords.
 *   3. Normalise to [0,1]^2 within the square crop rect.
 *   4. Map radiusPx to a fraction of the final image half-width.
 *   5. Subtract rotationDeg from disk.paDeg (both in the same y-down frame)
 *      and wrap into [0,180).
 *
 * The rotation matrix R(-θ) for angle θ = rotationDeg (y-down, clockwise):
 *   x' =  dx·cos θ + dy·sin θ
 *   y' = -dx·sin θ + dy·cos θ
 *
 * RecipeCrop enforces width === height (square crop), so half-width and
 * half-height are the same.  The derivation uses only width throughout.
 */

import type { RecipeCrop, RecipeDisk } from '../famous-curator/plugin/recipe';
import type { FamousCalibration } from '../../src/@types/loading/FamousCalibration';
import type { Vec2 } from '../../src/@types/math/Vec2';

export type DeriveCalibrationInput = {
  disk: RecipeDisk;
  crop: RecipeCrop;
  /** Catalog axisRatio fallback when disk.axisRatio is absent. */
  catalogAxisRatio: number;
  /** True when the shipped webp was deprojected (texture is face-on). */
  deprojected: boolean;
};

/**
 * Wraps any real-valued angle (degrees) into [0, 180).
 *
 * Position angles are axially symmetric — 0° and 180° describe the same
 * orientation — so we collapse the full circle onto the half-circle [0,180).
 * Negative inputs (e.g. -20°) map to their positive equivalent (160°).
 */
function normalizePa(deg: number): number {
  return ((deg % 180) + 180) % 180;
}

/** Pure. Source-px disk + final crop → normalized final-webp calibration. */
export function deriveFamousCalibration(input: DeriveCalibrationInput): FamousCalibration {
  const { disk, crop, catalogAxisRatio, deprojected } = input;

  // ── Center mapping ────────────────────────────────────────────────────────
  // Translate the nucleus to be relative to the crop centre in source coords.
  const cropCenterX = crop.x + crop.width / 2;
  const cropCenterY = crop.y + crop.height / 2;
  const dx = disk.centerPx[0] - cropCenterX;
  const dy = disk.centerPx[1] - cropCenterY;

  // Apply R(-rotationDeg) to map from the source frame into the crop's local
  // frame.  Same transform cropExtract.ts uses at lines 77-84.
  const rad = (crop.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  // Normalise to [0,1]^2.  The crop is square, so width == height; half-width
  // is the distance from centre to edge in both axes.
  const halfWidth = crop.width / 2;
  const center: Vec2 = [
    (localX + halfWidth) / crop.width,
    (localY + halfWidth) / crop.width,
  ];

  // ── Radius ────────────────────────────────────────────────────────────────
  // Fraction of the final-image half-width, so 1.0 means the disk edge
  // touches the image edge.
  const diskRadiusFrac = disk.radiusPx / halfWidth;

  // ── Position angle ────────────────────────────────────────────────────────
  // The crop rotation shifts the image axes by rotationDeg clockwise.  A PA
  // measured in the source frame decreases by the same amount in the final
  // image frame.  Wrap into [0,180) because PA is axially symmetric.
  const paDeg = normalizePa(disk.paDeg - crop.rotationDeg);

  // ── Axis ratio ────────────────────────────────────────────────────────────
  const axisRatio = disk.axisRatio ?? catalogAxisRatio;

  return { center, diskRadiusFrac, paDeg, axisRatio, deprojected };
}

/**
 * deprojectDisk — pure affine stretch that recovers the face-on disk view.
 *
 * A galaxy disk imaged at inclination i (b/a = cos i, roughly) appears
 * foreshortened along the minor axis.  Stretching that axis by 1/axisRatio
 * deprojects the disk to face-on, recovering detail lost to the foreshortening.
 * This runs on the hi-res source before downsize so the extra resolution along
 * the stretch direction is preserved in the final thumbnail.
 *
 * The transform is a 2×2 affine (no translation) built as:
 *
 *   M = R(paDeg) · diag(1, s) · R(paDeg)⁻¹,   s = 1 / axisRatio
 *
 * where R(θ) is the y-down clockwise rotation matrix [[cos θ, -sin θ],[sin θ, cos θ]]
 * and R(θ)⁻¹ = R(-θ) since rotations are orthogonal.  Expanding the product:
 *
 *   M = [[ cos²θ + s·sin²θ,   (1-s)·cos θ·sin θ ],
 *        [ (1-s)·cos θ·sin θ,  sin²θ + s·cos²θ  ]]
 *
 * The off-diagonal terms are equal — M is symmetric — because cos·sin commutes.
 *
 * Spot-checks:
 *   θ=0  → M = [[1,0],[0,s]] — scales image-Y (the minor axis when paDeg=0).
 *   θ=90 → M = [[s,0],[0,1]] — scales image-X (the minor axis when paDeg=90).
 *
 * Guards: axisRatio ≥ 1 (face-on, nothing to do) and axisRatio < DEPROJECT_MIN_AXIS_RATIO
 * (too inclined — the stretch smears rather than recovers) both return src untouched.
 * The caller is responsible for logging the skip when it matters.
 */
import type { Sharp } from 'sharp';
import { DEPROJECT_MIN_AXIS_RATIO } from '../../src/data/famousCalibration';

export type DeprojectInput = {
  /** Major-axis PA of the disk in the IMAGE frame, degrees. */
  paDeg: number;
  /** Disk b/a in [0,1]. 1 = face-on (no stretch). */
  axisRatio: number;
};

/**
 * True when a disk at this axis ratio should actually be stretched to face-on:
 * the band [DEPROJECT_MIN_AXIS_RATIO, 1).  Outside it deprojection is a no-op —
 * axisRatio >= 1 is already face-on (nothing to recover), and below the minimum
 * the disk is too inclined to recover (a >3.3× stretch smears more than it
 * fixes).  Exported so callers gate their encode path on the same band without
 * re-deriving the bounds.
 */
export function willDeproject(axisRatio: number): boolean {
  return axisRatio >= DEPROJECT_MIN_AXIS_RATIO && axisRatio < 1;
}

/**
 * Returns a sharp pipeline affine-stretched to face-on, or the input
 * unchanged when no stretch applies.  Pure w.r.t. the geometry; the caller
 * chains `.resize()` / `.webp()`.
 *
 * Stretch factor = 1 / axisRatio along the MINOR axis (perpendicular to
 * paDeg).  Outside the willDeproject band the input is returned untouched
 * (pass-through; caller logs the skip) — never a silent extreme smear.
 */
export function deprojectDisk(src: Sharp, input: DeprojectInput): Sharp {
  const { paDeg, axisRatio } = input;

  // Only the [DEPROJECT_MIN_AXIS_RATIO, 1) band is stretched (see willDeproject).
  if (!willDeproject(axisRatio)) return src;

  const s = 1 / axisRatio;
  const rad = (paDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // M = R(θ) · diag(1, s) · R(θ)⁻¹ (derived in module header).  Symmetric, so
  // the off-diagonal is a single shared term: M[0][1] === M[1][0].
  const a = cos * cos + s * sin * sin; // M[0][0]
  const offDiag = (1 - s) * cos * sin; // M[0][1] = M[1][0]
  const d = sin * sin + s * cos * cos; // M[1][1]

  // sharp().affine(...) applies the 2×2 matrix and auto-grows the output canvas
  // to fit the transformed bounding box.  Background fills any uncovered region
  // (transparent by default).
  return src.affine([a, offDiag, offDiag, d], { background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

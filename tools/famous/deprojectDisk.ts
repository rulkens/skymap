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
 * Guard: only a tilted, valid disk is stretched — axisRatio in (0, 1).  At
 * axisRatio >= 1 there is nothing to recover (already face-on/round) and at
 * axisRatio <= 0 the data is invalid; both return src untouched.
 */
import type { Sharp } from 'sharp';

export type DeprojectInput = {
  /** Major-axis PA of the disk in the IMAGE frame, degrees. */
  paDeg: number;
  /** Disk b/a in [0,1]. 1 = face-on (no stretch). */
  axisRatio: number;
};

/**
 * True when this axis ratio is tilted enough to deproject and not invalid:
 * the open range (0, 1).  axisRatio >= 1 is already face-on/round (nothing to
 * recover); axisRatio <= 0 is invalid data.  The single source of truth for
 * the deproject gate — export, process, deprojectDisk's own guard, and
 * buildFamous all route through it, so an explicitly-enabled toggle is honored
 * uniformly.  DEPROJECT_MIN_AXIS_RATIO is advisory (UI seed + warning) and is
 * deliberately not consulted here.
 */
export function willDeproject(axisRatio: number): boolean {
  return axisRatio > 0 && axisRatio < 1;
}

/**
 * Returns a sharp pipeline affine-stretched to face-on, or the input
 * unchanged when no stretch applies.  Pure w.r.t. the geometry; the caller
 * chains `.resize()` / `.webp()`.
 *
 * Stretch factor = 1 / axisRatio along the MINOR axis (perpendicular to
 * paDeg).  When willDeproject is false (axisRatio >= 1 or <= 0) the input is
 * returned untouched (pass-through).
 */
export function deprojectDisk(src: Sharp, input: DeprojectInput): Sharp {
  const { paDeg, axisRatio } = input;

  // Only a tilted, valid disk — axisRatio in (0, 1) — is stretched (see willDeproject).
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

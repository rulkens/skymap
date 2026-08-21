/**
 * orientationFlipCorrection — `inverse(orientationAtFlip) · currentOrientation`,
 * the correction surface-fixed follow (spec §4.6) composes into `poseBasis` /
 * `upBasis`. At the frame the mode engages, `orientationAtFlip ===
 * currentOrientation`, so the composed delta is exactly `I` and the flip
 * introduces no pose jump (the property `runFrame.test.ts` pins). As the body
 * spins on, the delta accumulates the rotation since the flip, holding the
 * camera fixed relative to the surface rather than the inertial frame.
 *
 * Both inputs are orthonormal rotations, so `inverse(R) = Rᵀ` — no general
 * 3×3 inversion needed. Written as a tight 9-float transpose-and-dot, the
 * same locality `camPosLocal.ts` uses for its own `Rᵀ · offset`, rather than
 * building a transposed `Mat3` and routing through the generic
 * `multiply3x3` — one temporary array fewer per frame this runs.
 */

import type { Mat3 } from '../../@types/math/Mat3';

export function orientationFlipCorrection(
  orientationAtFlip: Readonly<Mat3>,
  currentOrientation: Readonly<Mat3>,
): Mat3 {
  const a = orientationAtFlip;
  const b = currentOrientation;
  // result[c*3+r] = (column r of a) · (column c of b) — column-major
  // `Rᵀ·B`, mirroring camPosLocal.ts's "column i occupies m[i*3..i*3+2]".
  return [
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    a[3] * b[0] + a[4] * b[1] + a[5] * b[2],
    a[6] * b[0] + a[7] * b[1] + a[8] * b[2],
    a[0] * b[3] + a[1] * b[4] + a[2] * b[5],
    a[3] * b[3] + a[4] * b[4] + a[5] * b[5],
    a[6] * b[3] + a[7] * b[4] + a[8] * b[5],
    a[0] * b[6] + a[1] * b[7] + a[2] * b[8],
    a[3] * b[6] + a[4] * b[7] + a[5] * b[8],
    a[6] * b[6] + a[7] * b[7] + a[8] * b[8],
  ];
}

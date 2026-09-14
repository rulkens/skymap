/**
 * rotationLookAt — orientation for a body that aims at another: +X is the
 * boresight (the high-gain antenna's axis), +Z the reference up (the side the
 * bus hangs off). Aiming alone leaves the roll free — the dish would point
 * correctly while the craft spun arbitrarily around it — so +Z is placed as
 * near the ecliptic north pole as the boresight allows, and +Y completes the
 * right-handed triad.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { ECLIPTIC_FRAME } from '../../data/bodies/orbitPlaneFrames';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';

// Positions are equatorial-world, so the ecliptic pole is the obliquity-tilted
// frame normal rather than +z; `ECLIPTIC_FRAME` owns the 23.44°.
// Below this residual length (≈ the boresight-to-pole angle in radians) the
// projection has no direction left to carry the roll, so a second, always
// non-parallel reference takes over — the equinox, the frame's own +X.
const DEGENERATE_RESIDUAL = 1e-6;

/** `v` with its `axis` component removed; `axis` must be unit. */
function reject(v: Readonly<Vec3>, axis: Readonly<Vec3>): Vec3 {
  const d = dot3(v, axis);
  return [v[0] - d * axis[0], v[1] - d * axis[1], v[2] - d * axis[2]];
}

export function rotationLookAt(bodyPosMpc: Readonly<Vec3>, targetPosMpc: Readonly<Vec3>): Mat3 {
  const forward = normalize3([
    targetPosMpc[0] - bodyPosMpc[0],
    targetPosMpc[1] - bodyPosMpc[1],
    targetPosMpc[2] - bodyPosMpc[2],
  ]);

  const poleResidual = reject(ECLIPTIC_FRAME.normal, forward);
  const up = normalize3(
    Math.hypot(poleResidual[0], poleResidual[1], poleResidual[2]) < DEGENERATE_RESIDUAL
      ? reject(ECLIPTIC_FRAME.xAxis, forward)
      : poleResidual,
  );

  return mat3FromColumns(forward, cross3(up, forward), up);
}

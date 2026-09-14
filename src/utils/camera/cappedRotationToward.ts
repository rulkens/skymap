/**
 * cappedRotationToward — the quaternion turning basis `from` toward basis `to`,
 * with its angle clamped to `capRad`; `null` when they already agree (callers
 * keep the pose by reference, so a no-op write stays bit-identical).
 *
 * The rotation between two orthonormal bases is intrinsically shortest-path,
 * which is why the level/transport settles work on bases rather than on
 * wrapped angle differences. Bases are column-major tight `Mat3`s
 * (right | up | forward), the `BodyFixedPose.basisLocal` layout.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec4 } from '../../@types/math/Vec4';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/** Below this angle the bases agree to float noise and no correction is due. */
const AGREE_RAD = 1e-12;

export function cappedRotationToward(
  from: Readonly<Mat3>,
  to: Readonly<Mat3>,
  capRad: number,
): Vec4 | null {
  // R = to · fromᵀ; cell (r, c) of a tight Mat3 lives at [c*3 + r].
  const r: number[] = new Array<number>(9);
  for (let c = 0; c < 3; c += 1) {
    for (let row = 0; row < 3; row += 1) {
      r[c * 3 + row] =
        to[0 * 3 + row]! * from[0 * 3 + c]! +
        to[1 * 3 + row]! * from[1 * 3 + c]! +
        to[2 * 3 + row]! * from[2 * 3 + c]!;
    }
  }
  const vx = r[5]! - r[7]!;
  const vy = r[6]! - r[2]!;
  const vz = r[1]! - r[3]!;
  const sin2 = Math.hypot(vx, vy, vz); // 2·sinθ
  const cos2 = r[0]! + r[4]! + r[8]! - 1; // 2·cosθ
  const angleRad = Math.atan2(sin2, cos2);
  if (angleRad < AGREE_RAD) return null;

  let axis: [number, number, number];
  if (sin2 > 1e-9) {
    axis = [vx / sin2, vy / sin2, vz / sin2];
  } else {
    // θ ≈ π: the skew part vanishes and R = 2·aaᵀ − I, so the axis is read off
    // the largest diagonal instead (signs from the symmetric off-diagonals).
    const dx = (r[0]! + 1) / 2;
    const dy = (r[4]! + 1) / 2;
    const dz = (r[8]! + 1) / 2;
    if (dx >= dy && dx >= dz) {
      const ax = Math.sqrt(Math.max(0, dx));
      axis = [ax, r[3]! / (2 * ax), r[6]! / (2 * ax)];
    } else if (dy >= dz) {
      const ay = Math.sqrt(Math.max(0, dy));
      axis = [r[3]! / (2 * ay), ay, r[7]! / (2 * ay)];
    } else {
      const az = Math.sqrt(Math.max(0, dz));
      axis = [r[6]! / (2 * az), r[7]! / (2 * az), az];
    }
  }
  return quatFromAxisAngle(axis, Math.min(angleRad, capRad));
}

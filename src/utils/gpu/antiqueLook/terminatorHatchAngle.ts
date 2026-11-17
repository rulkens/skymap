/**
 * terminatorHatchAngle — the screen angle (radians, y down) of lines parallel
 * to every lit body's terminator this frame: perpendicular to the Sun's
 * direction as seen on screen. One angle per frame, because a hatch whose
 * direction varies per pixel cannot keep its phase (`dot(p, n)` swings whole
 * periods far from the origin) and dissolves into noise.
 */

import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';

/** A quiet slant for when the Sun is behind the view axis or unknown. */
const FALLBACK = 0.35;

export function terminatorHatchAngle(sun: BodyRelativePose | null): number {
  if (sun === null) return FALLBACK;
  const [ex, ey, ez] = sun.eyeRelBodyM;
  const b = sun.basisM;
  // Eye → Sun, against the camera's right (column 0) and up (column 1).
  const x = -(ex * b[0] + ey * b[1] + ez * b[2]);
  const y = -(ex * b[3] + ey * b[4] + ez * b[5]);
  if (Math.hypot(x, y) < 1e-9 * Math.hypot(ex, ey, ez)) return FALLBACK;
  // Screen y runs down; the terminator runs across the Sun's direction.
  return Math.atan2(x, y);
}

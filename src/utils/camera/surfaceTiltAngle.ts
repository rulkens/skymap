/**
 * surfaceTiltAngle — PROBE (shift+drag tilt): where a vertical drag leaves the
 * view's tilt away from nadir, in radians, clamped to what the body allows.
 *
 * delete when the globe-anchored camera pivot replaces surface navigation
 *
 * The ceiling is the body's angular radius seen from the eye, `asin(R / (R+h))`
 * — a ray tilted further than that leaves the ground entirely, so the horizon
 * IS the limit and it tightens as you climb (80° at 100 km over Earth, 23° at
 * 10 000 km). The floor is 0: nadir, straight down. Dragging UP (negative CSS
 * dy) tilts toward the horizon.
 */

/** Probe feel only: ~90° of tilt per 300 px of drag. */
const TILT_RAD_PER_PX = 0.005;
/** Keeps the aim off the exact tangent, where the ground ray grazes. */
const HORIZON_MARGIN_RAD = 0.02;

export function surfaceTiltAngle(
  currentRad: number,
  dyPx: number,
  eyeAltitudeMpc: number,
  bodyRadiusMpc: number,
): number {
  const ratio = bodyRadiusMpc / (bodyRadiusMpc + Math.max(0, eyeAltitudeMpc));
  const ceiling = Math.max(0, Math.asin(Math.min(1, ratio)) - HORIZON_MARGIN_RAD);
  return Math.max(0, Math.min(ceiling, currentRad - dyPx * TILT_RAD_PER_PX));
}

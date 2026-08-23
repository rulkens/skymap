/**
 * surfaceTiltAngle — PROBE (shift+drag tilt): where a vertical drag leaves the
 * view's tilt away from nadir, in radians. Dragging UP (negative CSS dy) tilts
 * toward the horizon and on into the sky.
 *
 * delete when the globe-anchored camera pivot replaces surface navigation
 *
 * 0 is straight down, π/2 is level, π is the zenith — the whole half-turn, so
 * the ground's horizon (`asin(R/(R+h))`: 80° at 100 km over Earth, 60° at
 * 1000 km) is a landmark on the way through, not a limit. The stop short of π
 * is a FOLD guard: the angle is measured with `acos`, so past the zenith it
 * would read smaller again and the drag would reverse.
 *
 * What the user meets FIRST is the caller's `PITCH_LIMIT` refusal, at
 * `π/2 + frame latitude`: tilting up swings the aim toward the frame pole, and
 * no yaw/pitch pose can look through it. So the sky is reachable by exactly the
 * eye's frame latitude above level — everything, at the pole; nothing, on the
 * frame equator. Its cure is the camera rewrite, not another clamp here.
 */

/** Probe feel only: ~90° of tilt per 300 px of drag. */
const TILT_RAD_PER_PX = 0.005;
const ZENITH_MARGIN_RAD = 0.02;

export function surfaceTiltAngle(currentRad: number, dyPx: number): number {
  return Math.max(0, Math.min(Math.PI - ZENITH_MARGIN_RAD, currentRad - dyPx * TILT_RAD_PER_PX));
}

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
 * Two things this probe CANNOT deliver, both measured, both the rewrite's to
 * fix (the reasoning is in the fix-round section of `fw-h-report.md`):
 *
 *  - A level horizon. Screen-up rolls about `frameUp(cam.upBasis)`, the
 *    orientation frame's pole, so a tilted view is rolled by up to 90° (dead
 *    east from the frame equator; 34° over Denmark). Only the standpoint's own
 *    vertical levels it — and that vector is degenerate looking straight down,
 *    which is where surface navigation lives, so it needs a HEADING held as
 *    camera state. The produced pose has no such field, and the render camera
 *    is rebuilt from the pose every frame.
 *  - A latitude-independent sweep. `PITCH_LIMIT` refuses an aim within 0.57°
 *    of the frame pole; that is a constraint on the POSE, untouched by any
 *    up-vector choice, and it caps the sweep at `π/2 + frame latitude`.
 */

/** Probe feel only: ~90° of tilt per 300 px of drag. */
const TILT_RAD_PER_PX = 0.005;
const ZENITH_MARGIN_RAD = 0.02;

export function surfaceTiltAngle(currentRad: number, dyPx: number): number {
  return Math.max(0, Math.min(Math.PI - ZENITH_MARGIN_RAD, currentRad - dyPx * TILT_RAD_PER_PX));
}

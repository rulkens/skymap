/**
 * trapezoidEase — a position envelope `[0,1] → [0,1]` with a TUNABLE ramp length.
 *
 * The named cubic eases (`easeInOutCubic` et al.) spend a fixed ~half the take
 * accelerating and decelerating. A flythrough often wants a SHORTER accel/decel
 * and a longer constant-speed cruise — "launch, get going, hold speed, settle".
 * `trapezoidEase` parameterises exactly that: it's the position curve of a
 * trapezoidal velocity profile —
 *
 *   velocity:  ramp 0→vmax over [0, f]  ·  constant vmax over [f, 1−f]  ·  ramp
 *              vmax→0 over [1−f, 1]
 *
 * — where `f` (the ramp fraction, each end) is the knob. Smaller `f` ⇒ snappier
 * launch + longer cruise; `f = 0.5` collapses the cruise to a point and the
 * curve becomes a smooth quadratic S (≈ the cubic inOut feel). The velocity
 * reaches zero at both ends, so a clip still settles at rest for a clean dwell
 * handoff, exactly like the cubic inOut it replaces.
 *
 * With linear velocity ramps the area under the profile is `vmax·(1−f)`, so
 * normalising the total displacement to 1 fixes `vmax = 1/(1−f)`; integrating
 * each piece gives the closed forms below. `f` is clamped to `(0, 0.5]` so the
 * cruise segment never inverts.
 */

const F_MIN = 1e-3;
const F_MAX = 0.5;

export function trapezoidEase(s: number, f: number): number {
  const x = s < 0 ? 0 : s > 1 ? 1 : s;
  const fr = f < F_MIN ? F_MIN : f > F_MAX ? F_MAX : f;
  const vmax = 1 / (1 - fr);

  if (x < fr) return (vmax * x * x) / (2 * fr); // accel ramp
  if (x <= 1 - fr) return (vmax * fr) / 2 + vmax * (x - fr); // cruise
  const r = 1 - x; // decel ramp (mirror of the accel ramp)
  return 1 - (vmax * r * r) / (2 * fr);
}

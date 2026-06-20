/**
 * evaluateTween — pure tween math: a `CameraTweenDescriptor` plus elapsed time
 * in, a fresh `CameraPose` out.
 *
 * Three properties make it composable and trivially testable:
 *
 *   - **No mutation.** Given a `CameraTweenDescriptor` and the elapsed time
 *     since the tween started, it returns a fresh `CameraPose`.  Nothing in
 *     `d`, `d.from`, or `d.to` is touched.
 *
 *   - **No world-space `position`.** `CameraPose` carries only the orbit
 *     parameters (target, yaw, pitch, distance); the world-space position is
 *     derived later by the frame loop that resolves the pose into a matrix, so
 *     it is not needed to evaluate the tween.
 *
 *   - **Elapsed-ms clock.** The caller owns the wall clock and supplies only
 *     `elapsedMs = now - tweenStartMs`.  This makes the function trivially
 *     testable with deterministic numbers.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import { easeOutCubic } from '../../../utils/math/easeOutCubic';
import { lerp } from '../../../utils/math/lerp';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';

/**
 * Evaluate the tween pose at `elapsedMs` milliseconds after the tween started.
 *
 * ### Saturation
 *
 * When `elapsedMs >= d.durationMs` the returned pose is an exact copy of
 * `d.to` (not the result of `easeOutCubic(1)`).  This avoids coterminal-angle
 * drift: `lerpAngleShortest(from, to, 1.0)` can land on a numerically different
 * but geometrically equivalent angle; clamping to `d.to` gives a predictable
 * resting pose the caller can compare with `===`.
 *
 * @param d         The timeless from→to descriptor.
 * @param elapsedMs Milliseconds elapsed since the tween was started (≥ 0).
 * @returns         A fresh `CameraPose` at the eased intermediate state.
 */
export function evaluateTween(d: CameraTweenDescriptor, elapsedMs: number): CameraPose {
  // Linear progress; may exceed 1 on slow frames or a paused tab waking up.
  const rawT = elapsedMs / d.durationMs;
  const finished = rawT >= 1;
  const linearT = finished ? 1 : Math.max(0, rawT);

  // Saturate: at or past the deadline, snap exactly to `d.to` so the caller
  // gets a predictable resting value without floating-point yaw drift.
  if (finished) {
    return {
      target: [d.to.target[0], d.to.target[1], d.to.target[2]],
      yaw: d.to.yaw,
      pitch: d.to.pitch,
      distance: d.to.distance,
    };
  }

  const t = easeOutCubic(linearT);

  return {
    // Fresh array — never alias d.from.target or d.to.target.
    target: [
      lerp(d.from.target[0], d.to.target[0], t),
      lerp(d.from.target[1], d.to.target[1], t),
      lerp(d.from.target[2], d.to.target[2], t),
    ],
    // Shortest-arc yaw — avoids multi-revolution spin when from and to straddle
    // ±π or when the camera has accumulated large yaw from repeated dragging.
    yaw: lerpAngleShortest(d.from.yaw, d.to.yaw, t),
    // Pitch is clamped in the controls layer and never wraps, so scalar lerp is
    // correct; no shortest-arc logic needed.
    pitch: lerp(d.from.pitch, d.to.pitch, t),
    distance: lerp(d.from.distance, d.to.distance, t),
  };
}

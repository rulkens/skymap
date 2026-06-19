/**
 * spinAutoRotate — pure successor to the old per-frame yaw-delta auto-rotate.
 *
 * The legacy engine did `cam.yaw += AUTO_ROTATE_YAW_DELTA` once per frame,
 * where `AUTO_ROTATE_YAW_DELTA = 0.000873` rad (~0.05°/frame at 60 fps).
 * That coupling to frame count made the spin rate frame-rate-dependent and
 * impossible to drive from a store-held intent without leaking frame metadata.
 *
 * This function replaces it with a pure pose transformer:
 *
 *   - **No mutation.** Takes a base `CameraPose` and returns a fresh one with
 *     only `yaw` advanced.  `base` and `base.target` are never touched.
 *
 *   - **Elapsed-ms clock.** The caller supplies `elapsedMs` (cumulative time
 *     since auto-rotate activated; `base` is frozen while active, so a per-frame
 *     delta would freeze the spin); the function converts to an equivalent yaw
 *     advance using an assumed 60 fps frame budget, preserving the original visual
 *     drift speed without any knowledge of actual frame count.
 *
 *   - **`rate` = radians per assumed-60-fps frame.** This matches the legacy
 *     `AUTO_ROTATE_YAW_DELTA` unit exactly, so existing constants transfer
 *     unchanged.  If `rate` were redefined as radians/ms the constant would
 *     need to be divided by 16.67 at every call site — unnecessary churn.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';

// Assumed frame duration at 60 fps.  `rate` is radians-per-frame under this
// budget, matching the legacy `AUTO_ROTATE_YAW_DELTA` unit so the constant
// transfers without rescaling.  The actual frame rate does not affect the
// result: `elapsedMs / FRAME_MS` is the number of "60-fps frames worth" of
// time that passed, and multiplying by the per-frame rate gives the correct
// total yaw advance regardless of whether the real frame was faster or slower.
const FRAME_MS = 1000 / 60;

/**
 * Return a fresh pose with `yaw` advanced by the rotation implied by
 * `rate` radians-per-frame over `elapsedMs` milliseconds at 60 fps.
 *
 * Only `yaw` changes; `target` (fresh copy), `pitch`, and `distance` are
 * carried through unchanged.
 *
 * @param base      The current camera pose (not mutated).
 * @param rate      Yaw advance in radians per assumed-60-fps frame.
 *                  Pass the legacy `AUTO_ROTATE_YAW_DELTA` directly.
 * @param elapsedMs Milliseconds elapsed since auto-rotate was activated.
 *                  `base` is frozen while auto-rotate is active, so this must
 *                  be the cumulative elapsed time (not a per-frame delta), or
 *                  the spin would advance one frame's worth and then freeze.
 * @returns         A fresh `CameraPose` with the advanced yaw.
 */
export function spinAutoRotate(base: CameraPose, rate: number, elapsedMs: number): CameraPose {
  return {
    // Fresh array — never alias base.target.
    target: [base.target[0], base.target[1], base.target[2]],
    yaw: base.yaw + rate * (elapsedMs / FRAME_MS),
    pitch: base.pitch,
    distance: base.distance,
  };
}

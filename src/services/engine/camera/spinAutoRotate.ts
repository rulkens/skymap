/**
 * spinAutoRotate — pure auto-rotate pose transformer.
 *
 * Auto-rotate advances the camera yaw at a fixed rate while the scene is idle.
 * Driving that from a store-held intent means it cannot read a per-frame
 * counter, so this is a pure transform with no frame-count or mutation coupling:
 *
 *   - **No mutation.** Takes a base `CameraPose` and returns a fresh one with
 *     only `yaw` advanced.  `base` and `base.target` are never touched.
 *
 *   - **Elapsed-ms clock.** The caller supplies `elapsedMs` (cumulative time
 *     since auto-rotate activated; `base` is frozen while active, so a per-frame
 *     delta would freeze the spin); the function converts that to a yaw advance
 *     against an assumed 60 fps frame budget, so the drift speed is independent
 *     of the real frame rate.
 *
 *   - **`rate` = radians per assumed-60-fps frame.** Keeping the unit as
 *     radians/frame lets the rate be authored as a plain per-frame angle;
 *     redefining it as radians/ms would force a /16.67 at every call site for
 *     no gain.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';

// Assumed frame duration at 60 fps. `rate` is radians-per-frame under this
// budget. The actual frame rate does not affect the result: `elapsedMs /
// FRAME_MS` is the number of "60-fps frames worth" of time that passed, and
// multiplying by the per-frame rate gives the correct total yaw advance
// regardless of whether the real frame was faster or slower.
const FRAME_MS = 1000 / 60;

/**
 * Return a fresh pose with `yaw` advanced by the rotation implied by
 * `rate` radians-per-frame over `elapsedMs` milliseconds at 60 fps.
 *
 * Only `yaw` changes; `target` (fresh copy), `pitch`, `distance`, and `roll`
 * are carried through unchanged.
 *
 * @param base      The current camera pose (not mutated).
 * @param rate      Yaw advance in radians per assumed-60-fps frame
 *                  (the camera slice's `autoRotate.rate`).
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
    roll: base.roll,
  };
}

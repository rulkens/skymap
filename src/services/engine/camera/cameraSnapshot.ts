/**
 * cameraSnapshot — tween the live camera toward an `InitialCam` snapshot.
 *
 * ### Why a helper
 *
 * `focusOnHome` on `EngineHandle` targets `state.initialCamSnapshot` and reads
 * the four orbit fields off it (`target.{x,y,z}`, `distance`, `yaw`, `pitch`).
 * Collapsing that into one call keeps the handle method a one-liner, and a
 * future home-targeting method plugs in without re-spelling the tween literal.
 *
 * ### Why the `state` parameter, not `(cam, snapshot)`
 *
 * The helper absorbs the cam-null guard itself, so callers do not repeat it.
 * Pulling `state` in is the cost of moving that guard out of the call site.
 *
 * ### Why `from` reads `cameraRuntime.lastPose.current`
 *
 * `lastPose.current` is the pose the user actually sees (produced by the driver
 * table each frame), while `state.cam` (the drag register) may be stale; seeding
 * `from` from the live pose lets an in-flight tween hand off smoothly.
 *
 * ### Why no requestRender
 *
 * The `startCameraTween` dispatch is a `camera/*` write, and `watchWakeSaga`/
 * WAKE_ROUTES turns every such write into a render request — so the wake is
 * automatic. (The lone caller, `focusOnHome`, also dispatches a selection write,
 * which wakes via `watchSelectionWakeSaga` too.)
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InitialCam } from '../../../@types/camera/InitialCam';
import type { AppStore } from '../../../store/types';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { startCameraTween } from '../../../state/camera/cameraSlice';

/**
 * Tween the live camera toward `snapshot` over the project-wide `FOCUS_TWEEN_MS`
 * duration — same easing curve as the focus tweens. Used by `focusOnHome` to
 * return to the bootstrap-derived framing without the visual abruptness of a
 * snap.
 *
 * The `from` pose is taken at call time from `state.cameraRuntime.lastPose`
 * (the live produced pose) so an in-flight tween hands off smoothly: the new
 * tween's `from` captures the camera's current visible position mid-animation.
 *
 * No-op when `state.cam` is null (pre-bootstrap / post-destroy). Callers do NOT
 * need to fire any URL-hash side-effect here; clearing `#focus=…` is a separate
 * concern owned by the call site that decides 'this action is leaving a focus
 * state'.
 */
export function tweenToCameraSnapshot(
  state: EngineState,
  snapshot: InitialCam,
  store: AppStore,
): void {
  if (!state.cam) return;

  // Read the live produced pose as the tween's `from`. `lastPose.current` is
  // the pose the user actually sees (produced by the driver table each frame);
  // at rest it equals `poseOf(cam)`, but mid-tween it is the interpolated
  // position rather than the stale drag register.
  const from = state.cameraRuntime.lastPose.current;

  store.dispatch(
    startCameraTween({
      from,
      to: {
        target: [snapshot.target[0], snapshot.target[1], snapshot.target[2]],
        yaw: snapshot.yaw,
        pitch: snapshot.pitch,
        distance: snapshot.distance,
      },
      durationMs: FOCUS_TWEEN_MS,
      easing: 'easeOutCubic',
    }),
  );
}

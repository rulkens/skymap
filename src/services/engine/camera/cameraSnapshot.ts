/**
 * cameraSnapshot — tween the live camera toward an `InitialCam` snapshot.
 *
 * ### Why a helper
 *
 * `focusOnHome` on `EngineHandle` targets `state.initialCamSnapshot` and reads
 * the same four orbit fields off it (`target.{x,y,z}`, `distance`, `yaw`,
 * `pitch`). Pre-extraction it built a full tween literal inline and handed it
 * to `tweens.start(...)`. Pulling that scaffolding here collapses the call site
 * to one line, and a future home-targeting method plugs in without re-spelling
 * the tween literal.
 *
 * ### Why the `state` parameter, not `(cam, snapshot)`
 *
 * The helper absorbs the cam-null guard itself — same pattern `tweenToGalaxy`
 * established for the focus-commit family. Pulling `state` in is the cost of
 * moving that guard out of the call site; the win is that callers who add a
 * third home-targeting method later inherit the safe behaviour for free.
 *
 * ### Why `InitialCam` rather than a narrowed structural type
 *
 * `tweenToGalaxy` declares its own minimum-surface `TweenTarget` type because
 * its only callers (`GalaxyInfo`-bearing) are structurally compatible with a
 * much narrower shape. Here, every caller already holds an `InitialCam` (built
 * once during bootstrap, stored on `state.initialCamSnapshot`); narrowing
 * wouldn't document anything the type doesn't already. Use the existing domain
 * type.
 *
 * ### Why `from` reads `cameraRuntime.lastPose.current`
 *
 * Same reason as `tweenToGalaxy`: `lastPose.current` is the pose the user
 * actually sees, while `state.cam` (the drag register) may be stale.
 *
 * ### Why `requestRender` after dispatch
 *
 * `startCameraTween` does not wake the render loop; an explicit wake ensures
 * the first tween frame fires immediately.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InitialCam } from '../../../@types/camera/InitialCam';
import type { AppStore } from '../../../store/types';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { startCameraTween } from '../../../state/camera/cameraSlice';

/**
 * Tween the live camera toward `snapshot` over the project-wide `FOCUS_TWEEN_MS`
 * duration — same easing curve, same advance loop as `tweenToGalaxy`. Used by
 * `focusOnHome` to return to the bootstrap-derived framing without the visual
 * abruptness of a snap.
 *
 * The from-snapshot is taken at call time from `state.cameraRuntime.lastPose`
 * (the live produced pose) so an in-flight tween hands off smoothly: the new
 * tween's `from` captures the camera's current visible position mid-animation.
 *
 * No-op when `state.cam` is null — same cam-null window as `tweenToGalaxy`.
 * Callers do NOT need to fire `cb.onFocusChange` here; that's a separate
 * semantic concern (telling the URL hash to clear `#focus=…`) and stays at the
 * call site that decides 'this action is leaving a focus state'.
 */
export function tweenToCameraSnapshot(
  state: EngineState,
  snapshot: InitialCam,
  store: AppStore,
): void {
  const cam = state.cam;
  if (!cam) return;

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

  // `startCameraTween` does not wake the render loop automatically — add an
  // explicit wake so the loop starts running the tween immediately.
  state.subsystems.scheduler.requestRender();
}

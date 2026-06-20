/**
 * cameraSnapshot — tween the live camera toward an `InitialCam` snapshot.
 *
 * ### Why a helper
 *
 * `focusOnHome` on `EngineHandle` targets `state.initialCamSnapshot` and reads
 * the same four orbit fields off it (`target.{x,y,z}`, `distance`, `yaw`,
 * `pitch`).  Pre-extraction it built a full `CameraTween` literal inline —
 * `vec3.clone` of the from-target, `vec3.fromValues` of the to-target, every
 * other from/to scalar — and handed it to `tweens.start(...)`.  Pulling that
 * scaffolding here collapses the call site to one line, and a future
 * home-targeting method (e.g. a "tween home" variant for a benchmark) plugs in
 * without re-spelling the tween literal.
 *
 * ### Why the `state` parameter, not `(cam, snapshot)`
 *
 * The helper absorbs the cam-null guard itself — same pattern `tweenToGalaxy`
 * established for the focus-commit family.  Pulling `state` in is the cost of
 * moving that guard out of the call site; the win is that callers who add a
 * third home-targeting method later inherit the safe behaviour for free.
 *
 * ### Why `InitialCam` rather than a narrowed structural type
 *
 * `tweenToGalaxy` declares its own minimum-surface `TweenTarget` type because
 * its only callers (`GalaxyInfo`-bearing) are structurally compatible with a
 * much narrower shape.  Here, every caller already holds an `InitialCam` (built
 * once during bootstrap, stored on `state.initialCamSnapshot`); narrowing
 * wouldn't document anything the type doesn't already.  Use the existing domain
 * type.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InitialCam } from '../../../@types/camera/InitialCam';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';

/**
 * Tween the live camera toward `snapshot` over the project-wide
 * `FOCUS_TWEEN_MS` duration — same easing curve, same advance loop
 * as `tweenToGalaxy`.  Used by `focusOnHome` to return to the
 * bootstrap-derived framing without the visual abruptness of a snap.
 *
 * The from-snapshot is taken at call time so an in-flight tween
 * hands off smoothly: the new tween's `from*` fields capture the
 * camera's current pose mid-animation, and the tween manager
 * replaces the in-flight tween with this one (`tweens.start` is
 * "at-most-one in-flight" by contract).
 *
 * `vec3.clone` on `cam.target` defends against the same
 * shared-reference hazard `tweenToGalaxy` documents — the next
 * frame's orbit-controls update could otherwise mutate the
 * from-target out from under the in-progress tween.
 *
 * No-op when `state.cam` is null — same cam-null window as
 * `tweenToGalaxy`.
 */
export function tweenToCameraSnapshot(state: EngineState, snapshot: InitialCam): void {
  const cam = state.cam;
  if (!cam) return;

  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(snapshot.target[0], snapshot.target[1], snapshot.target[2]),
    fromDistance: cam.distance,
    toDistance: snapshot.distance,
    fromYaw: cam.yaw,
    toYaw: snapshot.yaw,
    fromPitch: cam.pitch,
    toPitch: snapshot.pitch,
  });
  // tweens.start wakes the scheduler; no follow-up requestRender needed.
}

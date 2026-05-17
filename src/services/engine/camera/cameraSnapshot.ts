/**
 * cameraSnapshot — apply an `InitialCam` snapshot to the live camera,
 * either instantly (snap) or via the focus tween.
 *
 * ### Why a helper
 *
 * Two public-handle methods on `EngineHandle` — `resetCamera` and
 * `focusOnHome` — both target `state.initialCamSnapshot` and read the
 * same four fields off it (`target.{x,y,z}`, `distance`, `yaw`,
 * `pitch`).  Pre-extraction:
 *
 *   - `resetCamera` did a synchronous index-by-index field copy onto
 *     `cam`, then called `updatePosition(cam)` and
 *     `scheduler.requestRender()`.
 *   - `focusOnHome` built a full `CameraTween` literal — `vec3.clone`
 *     of the from-target, `vec3.fromValues` of the to-target, every
 *     other from/to scalar — and handed it to `tweens.start(...)`.
 *
 * The two methods diverge in motion mechanism (snap vs tween) but
 * agree on every other detail: which snapshot to read, which fields
 * to copy, the cam-null guard, and the trailing `requestRender`.  Two
 * tiny helpers here capture that shared scaffolding so both call
 * sites collapse to one line.  Future home-target changes (e.g. an
 * "instant teleport home" hotkey, or a hard-cut version for
 * benchmarks) plug into the same pair without re-spelling either
 * branch.
 *
 * ### Why two functions, not one with a `mode: 'snap' | 'tween'` flag
 *
 * The two motion mechanisms have nothing in common at the
 * implementation level — `snapToCameraSnapshot` mutates `cam.*` in
 * place and re-derives the world-space basis via `updatePosition`;
 * `tweenToCameraSnapshot` calls into the tween manager and lets the
 * per-frame advance handle the field updates.  A unified entry
 * point would either be a switch statement (no shared work) or a
 * "tween with duration 0" path that runs the tween manager for one
 * synchronous step (overhead for a snap that doesn't need it).
 * Two siblings keep each branch obvious.
 *
 * ### Why the `state` parameter, not `(cam, snapshot)`
 *
 * Both helpers absorb the cam-null guard themselves — same pattern
 * `tweenToGalaxy` established for the focus-commit family.  Pulling
 * `state` in is the cost of moving that guard out of the call site;
 * the win is that callers who add a third home-targeting method later
 * inherit the safe behaviour for free.
 *
 * ### Why `InitialCam` rather than a narrowed structural type
 *
 * `tweenToGalaxy` declares its own minimum-surface `TweenTarget` type
 * because its only callers (`GalaxyInfo`-bearing) are structurally
 * compatible with a much narrower shape.  Here, every caller already
 * holds an `InitialCam` (built once during bootstrap, stored on
 * `state.initialCamSnapshot`); narrowing wouldn't document anything
 * the type doesn't already.  Use the existing domain type.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InitialCam } from '../../../@types/camera/InitialCam';
import { updatePosition } from '../../camera/orbitCamera';
import { FOCUS_TWEEN_MS } from './focusTween';

/**
 * Snap the live camera to `snapshot` instantly — no tween, no
 * animation frame budget consumed beyond the single render this
 * function requests.  The four mutable orbit-camera fields
 * (`target`, `distance`, `yaw`, `pitch`) are copied; the immutable
 * framing fields (`fovYRad`, `near`, `far`) are NOT touched because
 * `cam` already carries them and runtime mutation of the projection
 * basis would invalidate the live view-projection matrix.
 *
 * `updatePosition(cam)` re-derives the world-space basis from the
 * new orbit pose — same call `OrbitControls`'s pointer handler makes
 * every drag.  Without it the camera position vector lags one frame
 * behind the target / distance / yaw / pitch values.
 *
 * No-op when `state.cam` or `state.initialCamSnapshot` would have
 * been null; both consumers (`resetCamera`, future siblings) call
 * this only after their own guard, but absorbing the guard here too
 * is cheap and matches `tweenToGalaxy`'s pattern.
 */
export function snapToCameraSnapshot(state: EngineState, snapshot: InitialCam): void {
  const cam = state.cam;
  if (!cam) return;

  cam.target[0] = snapshot.target[0];
  cam.target[1] = snapshot.target[1];
  cam.target[2] = snapshot.target[2];
  cam.distance = snapshot.distance;
  cam.yaw = snapshot.yaw;
  cam.pitch = snapshot.pitch;
  updatePosition(cam);
  state.subsystems.scheduler.requestRender();
}

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
 * `tweenToGalaxy`.  Callers do NOT need to fire `cb.onFocusChange`
 * here; that's a separate semantic concern (telling the URL hash to
 * clear `#focus=…`) and stays at the call site that decides "this
 * action is leaving a focus state".
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
  state.subsystems.scheduler.requestRender();
}

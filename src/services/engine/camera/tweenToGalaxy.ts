/**
 * tweenToGalaxy — kick off a focus camera tween toward a galaxy.
 *
 * ### Why a helper
 *
 * Three public-handle methods on `EngineHandle` — `focusOn`, `selectFamous`,
 * and `selectByAlias` — each carried the same five-line block:
 *
 * ```ts
 * store.dispatch(startCameraTween({
 *   from: poseOf(cam),
 *   to: { target: [x, y, z], yaw: cam.yaw, pitch: cam.pitch, distance: ... },
 *   durationMs: FOCUS_TWEEN_MS,
 *   easing: 'easeOutCubic',
 * }));
 * state.subsystems.scheduler.requestRender();
 * ```
 *
 * Three near-identical bodies — exactly the kind of copy-paste that silently
 * rots when one site adds a new field (e.g. an FOV transition) and the others
 * lag behind. One helper, three call sites collapse to a single line each.
 *
 * ### Why we DON'T extend the responsibility
 *
 * Each call site has its own pre-tween bookkeeping that doesn't belong in the
 * helper:
 *   - `selectFamous` / `selectByAlias` resolve a `GalaxyInfo` via
 *     `buildGalaxyInfo`, then call `setSelected` and `cb.onFocusChange` before
 *     tweening;
 *   - `focusOn` calls `cb.onFocusChange` first so the URL hash updates in
 *     lock-step with the user's commitment.
 *
 * Pulling that work into `tweenToGalaxy` would force the helper to know about
 * callbacks, selection state, and source enums — turning a five-line dispatcher
 * into a multi-purpose coordinator. The single responsibility we DO want is
 * 'given a camera-able target, start the tween' — keep it tiny.
 *
 * ### Why the cam-null guard is here
 *
 * `state.cam` is typed `OrbitCamera | null` because two reachable windows
 * leave it null:
 *   - **Pre-bootstrap**: `createOrbitCamera` runs inside `wireInput` during the
 *     bootstrap IIFE, after `initGpu` and the first cloud arrival. Code that
 *     fires before then (e.g. an unlikely `selectByAlias` from a deep-link
 *     drain that races the very first cloud upload) still finds `cam` null.
 *   - **Post-destroy**: `handle.destroy()` detaches controls and clears
 *     `state.cam = null`. An in-flight focus promise that resolves after
 *     destroy must not crash the engine on shutdown.
 *
 * The three call sites all check for null themselves today — the helper absorbs
 * that check so future call sites get the safe behaviour for free. It is
 * genuinely needed; do not remove on the grounds of YAGNI.
 *
 * ### Why `TweenTarget` is a structural minimum, not `GalaxyInfo`
 *
 * The helper only reads four fields off the target: `x`, `y`, `z`, and
 * `diameterKpc`. Declaring the parameter as `GalaxyInfo` would imply the
 * helper might reach for ra/dec/redshift/etc., which it never does. The
 * minimum-surface type doubles as documentation: 'this is exactly the data the
 * tween needs.' Production callers pass a full `GalaxyInfo` and TypeScript
 * accepts it via structural compatibility.
 *
 * ### Why `from` reads `cameraRuntime.lastPose.current`
 *
 * At focus time the camera may be mid-tween (rapid re-click). In that case
 * `state.cam` (the drag register) holds a stale pose from the last gesture,
 * while `lastPose.current` holds the last PRODUCED pose — the one the user
 * actually sees on screen. Seeding `from` from `lastPose.current` makes
 * re-focus hand off smoothly from exactly the visible position; seeding from
 * `state.cam` would produce a one-frame jump to the stale register value.
 * At rest, `lastPose.current == base` and `poseOf(state.cam)` would also be
 * equal, so both sources agree; `lastPose.current` is always safe.
 *
 * ### Why `requestRender` after `startCameraTween`
 *
 * `startCameraTween` does NOT wake the render loop (it dispatches a settings-
 * style action; the watchWake saga matches only certain prefixes — Task 4.3 is
 * out of scope for this commit). An explicit `scheduler.requestRender()` here
 * ensures the loop wakes for the first tween frame. Without it, the tween
 * dispatch would land in the store but the loop would stay asleep until some
 * other event woke it, producing a silent stall on focus.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { TweenTarget } from '../../../@types/camera/TweenTarget';
import type { AppStore } from '../../../store/types';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { galaxyFocusDistance } from './galaxyFocusDistance';
import { startCameraTween } from '../../../state/camera/cameraSlice';

/**
 * Start a focus tween toward `target`, snapshotting the current live camera
 * pose as `from` so an in-flight tween hands off smoothly to the new one.
 *
 * Yaw and pitch are preserved — the user keeps their orientation; only the
 * orbit target and distance change. The duration is the project-wide
 * `FOCUS_TWEEN_MS`; the destination distance is derived from `target.diameterKpc`
 * via `galaxyFocusDistance` (which clamps to a sensible minimum so dwarfs don't
 * end up framing the camera inside the disk).
 *
 * No-op when `state.cam` is null — see the module header for the two windows
 * where that happens.
 */
export function tweenToGalaxy(state: EngineState, target: TweenTarget, store: AppStore): void {
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
        target: [target.x, target.y, target.z],
        yaw: from.yaw,
        pitch: from.pitch,
        distance: galaxyFocusDistance(target.diameterKpc),
      },
      durationMs: FOCUS_TWEEN_MS,
      easing: 'easeOutCubic',
    }),
  );

  // `startCameraTween` does not wake the render loop automatically — add an
  // explicit wake so the loop starts running the tween immediately. Without
  // this the tween would wait until the next unrelated event woke the loop.
  state.subsystems.scheduler.requestRender();
}

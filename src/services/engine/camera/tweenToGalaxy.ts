/**
 * tweenToGalaxy — kick off a focus camera tween toward a galaxy.
 *
 * ### Why a helper
 *
 * The focus-tween saga (`watchFocusTween`) and `focusOnHome` each kick off
 * a camera tween toward a galaxy; both carry the same five-line block. One
 * helper, two call sites collapsed to a single line each.
 *
 * ### Why we DON'T extend the responsibility
 *
 * The caller (the focus-tween saga) resolves the `GalaxyInfo` and has already
 * dispatched the selection-slot write before reaching here. Pulling that into
 * `tweenToGalaxy` would force the helper to know about the store and selection
 * state — turning a five-line tween starter into a multi-purpose coordinator.
 * The single responsibility we DO want is "given a camera-able target, start
 * the tween" — keep it tiny.
 *
 * ### Why the cam-null guard is here
 *
 * `state.cam` is typed `OrbitCamera | null` because two reachable
 * windows leave it null:
 *   - **Pre-bootstrap**: `createOrbitCamera` runs inside `wireInput`
 *     during the bootstrap IIFE, after `initGpu` and the first cloud
 *     arrival.  A focus saga that races bootstrap still finds `cam` null.
 *   - **Post-destroy**: `handle.destroy()` detaches controls and clears
 *     `state.cam = null`.  An in-flight focus saga that resolves after
 *     destroy must not crash the engine on shutdown.
 *
 * The helper absorbs the null check so call sites get safe behaviour for
 * free.  It is genuinely needed; do not remove on the grounds of YAGNI.
 *
 * ### Why `TweenTarget` is a structural minimum, not `GalaxyInfo`
 *
 * The helper only reads four fields off the target: `x`, `y`, `z`, and
 * `diameterKpc`.  Declaring the parameter as `GalaxyInfo` would imply
 * the helper might reach for ra/dec/redshift/etc., which it never does.
 * The minimum-surface type doubles as documentation: "this is exactly
 * the data the tween needs."  Production callers pass a full
 * `GalaxyInfo` and TypeScript accepts it via structural compatibility.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { TweenTarget } from '../../../@types/camera/TweenTarget';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { galaxyFocusDistance } from './galaxyFocusDistance';

/**
 * Start a focus tween toward `target`, snapshotting the current camera
 * pose so an in-flight tween hands off smoothly to the new one.
 *
 * Yaw and pitch are preserved — the user keeps their orientation; only
 * the orbit target and distance change.  The duration is the
 * project-wide `FOCUS_TWEEN_MS`; the destination distance is derived
 * from `target.diameterKpc` via `galaxyFocusDistance` (which clamps to a
 * sensible minimum so dwarfs don't end up framing the camera inside
 * the disk).
 *
 * No-op when `state.cam` is null — see the module header for the two
 * windows where that happens.
 */
export function tweenToGalaxy(state: EngineState, target: TweenTarget): void {
  const cam = state.cam;
  if (!cam) return;

  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    // vec3.clone copies the target tuple so later mutation of
    // cam.target (the next frame's orbit-controls update, an
    // interrupting tween, …) doesn't corrupt the from-snapshot.
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(target.x, target.y, target.z),
    fromDistance: cam.distance,
    toDistance: galaxyFocusDistance(target.diameterKpc),
    fromYaw: cam.yaw,
    toYaw: cam.yaw,
    fromPitch: cam.pitch,
    toPitch: cam.pitch,
  });
  // tweens.start wakes the scheduler; no follow-up requestRender needed.
}

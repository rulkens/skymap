/**
 * cameraClock — the engine Resource that turns descriptor-identity changes
 * into elapsed-ms values for camera drivers.
 *
 * The clock sits between the Redux store (timeless intent) and the frame-loop
 * drivers (need an elapsed-ms for easing). Each frame the caller passes the
 * current tween descriptor and the auto-rotate active bit; the clock detects
 * when either changed by reference identity / value, resets the relevant
 * start time, and returns elapsed ms from that start.
 *
 * Both functions take `nowMs` as a parameter — they never read
 * `performance.now()` or `Date.now()` themselves. The caller owns the wall
 * clock; this keeps the clock deterministic and testable.
 *
 * One module for both functions (rather than one-fn-per-file) because they
 * share the `CameraClock` Resource: the two halves are inseparable parts of
 * one stateful computation. Same reasoning as `cameraDrivers.ts` holding both
 * `runCameraDrivers` and `buildCameraDrivers`.
 */

import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { CameraPose } from '../../../@types/camera/CameraPose';

/**
 * Create a fresh CameraClock with no recorded starts.
 * Construct once per engine session; pass by reference to the elapsed fns
 * on every frame.
 */
export function createCameraClock(): CameraClock {
  return {
    tweenStartMs: null,
    autoRotateStartMs: null,
    lastTweenRef: null,
    lastAutoRotateActive: false,
    lastBaseRef: null,
  };
}

/**
 * Detect whether the tween descriptor reference changed; if so, reset the
 * tween start to `nowMs` (or null when the new descriptor is null). Then
 * return ms elapsed since the current tween started.
 *
 * A freshly-installed descriptor returns 0 on the arrival frame and grows on
 * subsequent frames that carry the same reference. A null tween always
 * returns 0.
 *
 * Reference identity is the correct signal: a `startCameraTween` dispatch
 * installs a new object, so `!==` fires exactly once on the transition frame.
 */
export function tweenElapsed(
  clock: CameraClock,
  tween: CameraTweenDescriptor | null,
  nowMs: number,
): number {
  if (tween !== clock.lastTweenRef) {
    clock.lastTweenRef = tween;
    clock.tweenStartMs = tween === null ? null : nowMs;
  }
  return clock.tweenStartMs === null ? 0 : nowMs - clock.tweenStartMs;
}

/**
 * Reset the auto-rotate start to `nowMs` when the active bit flips OR when the
 * `base` reference changes underneath an active spin; then return ms elapsed
 * since that start.
 *
 * `spinAutoRotate` advances yaw from a FROZEN base by cumulative elapsed. A
 * commit-on-edge (drag-release, focus settle) installs a NEW base object while
 * `active` stays true — without the base-identity reset the accumulated elapsed
 * would apply to the fresh base and jump the camera on resume. `base` only
 * changes on a commit edge, never mid-continuous-spin, so a steady spin is
 * never reset by this.
 *
 * Active false→true (or a base change) returns 0 on that frame then grows. Any
 * transition to false returns 0.
 */
export function autoRotateElapsed(
  clock: CameraClock,
  active: boolean,
  base: CameraPose,
  nowMs: number,
): number {
  if (active !== clock.lastAutoRotateActive || base !== clock.lastBaseRef) {
    clock.lastAutoRotateActive = active;
    clock.lastBaseRef = base;
    clock.autoRotateStartMs = active ? nowMs : null;
  }
  return clock.autoRotateStartMs === null ? 0 : nowMs - clock.autoRotateStartMs;
}

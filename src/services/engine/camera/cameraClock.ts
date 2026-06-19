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
 * Detect whether the auto-rotate active bit flipped; if so, reset the
 * auto-rotate start to `nowMs` (or null when it deactivated). Then return
 * ms elapsed since auto-rotate last became active.
 *
 * Active false→true returns 0 on the activation frame then grows. Any
 * transition to false returns 0.
 */
export function autoRotateElapsed(clock: CameraClock, active: boolean, nowMs: number): number {
  if (active !== clock.lastAutoRotateActive) {
    clock.lastAutoRotateActive = active;
    clock.autoRotateStartMs = active ? nowMs : null;
  }
  return clock.autoRotateStartMs === null ? 0 : nowMs - clock.autoRotateStartMs;
}

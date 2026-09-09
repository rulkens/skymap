/**
 * cameraClock — the elapsed functions over the `CameraClock` Resource. Each
 * resets its start on a reference-identity change of its descriptor and returns
 * elapsed since. All take `nowMs` from the caller (never `performance.now()`)
 * so the clock is deterministic; `clipElapsed` returns SECONDS, the rest ms.
 */

import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FrameTween } from '../../../@types/camera/FrameTween';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { CameraState } from '../../../@types/camera/CameraState';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

/** One per engine session; passed by reference to every elapsed fn. */
export function createCameraClock(): CameraClock {
  return {
    tweenStartMs: null,
    autoRotateStartMs: null,
    lastTweenRef: null,
    lastAutoRotateActive: false,
    frameTweenStartMs: null,
    lastFrameTweenRef: null,
    lastBaseRef: null,
    clipStartMs: null,
    lastClipRef: null,
    followStartMs: null,
    lastFollowRef: null,
    followFrom: null,
    followDistanceTarget: null,
    followPanOffset: [0, 0, 0],
  };
}

/** Null tween ⇒ 0; a fresh descriptor ref returns 0 on its arrival frame. */
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

/** Same identity-reset idiom as `tweenElapsed`, for the orientation roll. */
export function frameTweenElapsed(
  clock: CameraClock,
  frameTween: FrameTween | null,
  nowMs: number,
): number {
  if (frameTween !== clock.lastFrameTweenRef) {
    clock.lastFrameTweenRef = frameTween;
    clock.frameTweenStartMs = frameTween === null ? null : nowMs;
  }
  return clock.frameTweenStartMs === null ? 0 : nowMs - clock.frameTweenStartMs;
}

/**
 * Resets on the active flip OR a `base` ref change: `spinAutoRotate` advances
 * yaw from a FROZEN base by cumulative elapsed, and a commit-on-edge installs a
 * new base while `active` stays true — without the reset the accumulated
 * elapsed would apply to the fresh base and jump the camera on resume.
 */
export function autoRotateElapsed(
  clock: CameraClock,
  active: boolean,
  base: FramedCameraPose,
  nowMs: number,
): number {
  if (active !== clock.lastAutoRotateActive || base !== clock.lastBaseRef) {
    clock.lastAutoRotateActive = active;
    clock.lastBaseRef = base;
    clock.autoRotateStartMs = active ? nowMs : null;
  }
  return clock.autoRotateStartMs === null ? 0 : nowMs - clock.autoRotateStartMs;
}

/** SECONDS, not ms — `evaluateClip` takes `elapsedSec`. */
export function clipElapsed(clock: CameraClock, clip: CameraState['clip'], nowMs: number): number {
  if (clip !== clock.lastClipRef) {
    clock.lastClipRef = clip;
    clock.clipStartMs = clip === null ? null : nowMs;
  }
  return clock.clipStartMs === null ? 0 : (nowMs - clock.clipStartMs) / 1000;
}

/**
 * Keys on the focus ROW reference: a re-select of the same body is a fresh row
 * (the ease restarts once), a drag mid-follow is not (no re-approach on
 * release). The edge also nulls `followFrom` / `followDistanceTarget` and
 * zeroes the pan offset; the driver refills them on its next produce (only it
 * sees the live register and the body radius / FOV).
 */
export function followElapsed(
  clock: CameraClock,
  focusRow: SelectionRow | null,
  nowMs: number,
): number {
  if (focusRow !== clock.lastFollowRef) {
    clock.lastFollowRef = focusRow;
    clock.followStartMs = focusRow === null ? null : nowMs;
    clock.followFrom = null;
    clock.followDistanceTarget = null;
    clock.followPanOffset = [0, 0, 0];
  }
  return clock.followStartMs === null ? 0 : nowMs - clock.followStartMs;
}

/**
 * cameraClock — the engine Resource that turns descriptor-identity changes
 * into elapsed values for camera drivers.
 *
 * The clock sits between the Redux store (timeless intent) and the frame-loop
 * drivers. Each frame the caller passes the current tween descriptor, the
 * auto-rotate active bit, and the active clip; the clock detects when any
 * changed by reference identity / value, resets the relevant start time, and
 * returns elapsed time from that start.
 *
 * The elapsed functions share one resource: `tweenElapsed`, `autoRotateElapsed`,
 * and `followElapsed` all return milliseconds (for easing drivers); `clipElapsed`
 * returns SECONDS (for `evaluateClip`). All take `nowMs` as a parameter — they
 * never read `performance.now()` or `Date.now()` themselves. The caller owns the
 * wall clock; this keeps the clock deterministic and testable. The pan trio
 * (`followPanWorld` / `addFollowPan` / `accumulateFollowPan`) involves no
 * elapsed time, but lives here because `followPanStored` is follow-runtime
 * state the same resource owns and `followElapsed` zeroes on a fresh focus.
 *
 * One module for all four functions because they share the `CameraClock`
 * Resource: the halves are inseparable parts of one stateful computation.
 * Same reasoning as `cameraDrivers.ts` holding both `runCameraDrivers` and
 * `buildCameraDrivers`.
 */

import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FrameTween } from '../../../@types/camera/FrameTween';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraState } from '../../../@types/camera/CameraState';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';

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
    frameTweenStartMs: null,
    lastFrameTweenRef: null,
    lastBaseRef: null,
    clipStartMs: null,
    lastClipRef: null,
    followStartMs: null,
    lastFollowRef: null,
    followFrom: null,
    followDistanceTarget: null,
    followPanStored: [0, 0, 0],
    lastPanTarget: null,
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
 * Detect whether the frame-tween descriptor reference changed; if so, reset the
 * frame-roll start to `nowMs` (or null when the new descriptor is null). Then
 * return ms elapsed since the current frame roll started.
 *
 * A freshly-installed descriptor returns 0 on the arrival frame and grows on
 * subsequent frames that carry the same reference. A null frame tween always
 * returns 0.
 *
 * Reference identity is the correct signal: an orientation-frame switch installs
 * a new `FrameTween` object, so `!==` fires exactly once on the transition frame
 * — the same identity-reset idiom `tweenElapsed` uses for camera tweens.
 */
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

/**
 * Detect whether the clip reference changed; if so, reset the clip start to
 * `nowMs` (or null when the new clip is null). Then return SECONDS elapsed
 * since the current clip started.
 *
 * Unit boundary: unlike `tweenElapsed` (which returns milliseconds for the
 * easing driver), `clipElapsed` returns SECONDS because `evaluateClip` takes
 * an `elapsedSec` parameter. The conversion is `(nowMs - clipStartMs) / 1000`.
 *
 * A freshly-installed clip reference returns 0 on the arrival frame and grows
 * in seconds on subsequent frames that carry the same reference. A null clip
 * always returns 0.
 *
 * Reference identity is the correct signal: a `startClip` dispatch installs a
 * new `{ data, frame }` object, so `!==` fires exactly once on the
 * transition frame — same pattern as `tweenElapsed`.
 */
export function clipElapsed(clock: CameraClock, clip: CameraState['clip'], nowMs: number): number {
  if (clip !== clock.lastClipRef) {
    clock.lastClipRef = clip;
    clock.clipStartMs = clip === null ? null : nowMs;
  }
  return clock.clipStartMs === null ? 0 : (nowMs - clock.clipStartMs) / 1000;
}

/**
 * Reset the follow-approach start to `nowMs` when the focus ROW reference
 * changes (a new / re-selected body, or focus leaving a body → null); then
 * return ms elapsed since that start.
 *
 * Keys on the row REFERENCE, not the body id, so a re-select of the same body
 * (a fresh `selectionRows.focus` object) restarts the ease exactly once — the
 * same identity-reset pattern `tweenElapsed` uses. A drag mid-follow does not
 * change the ref, so the ease is not restarted on drag-release: the camera
 * resumes its saturated follow instead of re-approaching.
 *
 * On the reset edge it also NULLS `followFrom` AND `followDistanceTarget`,
 * signalling the driver's `pose` to re-capture the live on-screen pose as the
 * `from` the approach eases out of, and to re-seed the distance target to the
 * framing distance (the INITIAL-APPROACH source — see `CameraClock`). The capture
 * is split from this timer because only the driver (closing over `EngineState`)
 * can see the live rendered pose (`lastPose`) and the body radius / FOV; this
 * function sees only the store's focus ref.
 *
 * A freshly-selected body returns 0 on the arrival frame and grows on later
 * frames carrying the same ref. A null focus always returns 0.
 */
export function followElapsed(
  clock: CameraClock,
  focusRow: SelectionRow | null,
  nowMs: number,
): number {
  if (focusRow !== clock.lastFollowRef) {
    clock.lastFollowRef = focusRow;
    clock.followStartMs = focusRow === null ? null : nowMs;
    // Force the driver to re-capture the `from` pose and re-seed the framing
    // distance target on the next produce (fresh-approach signal).
    clock.followFrom = null;
    clock.followDistanceTarget = null;
    // A NEW focus starts centred: zero the strafe offset and drop the drag-delta
    // chain. (Any focus ROW ref change is a new target, incl. re-selecting the
    // same body — same identity-reset semantics the fields above use.)
    clock.followPanStored = [0, 0, 0];
    clock.lastPanTarget = null;
  }
  return clock.followStartMs === null ? 0 : nowMs - clock.followStartMs;
}

/**
 * Read `followPanStored` in WORLD space. It is STORED in the frame its strafe
 * was authored in — world while surface-fixed follow is disengaged, the
 * body-at-engage frame while engaged (`corotation` = that R̃, null for
 * identity). Every pivot-placing site reads through here; `addFollowPan` writes.
 */
export function followPanWorld(clock: CameraClock, corotation: Readonly<Mat3> | null): Vec3 {
  return corotation === null
    ? clock.followPanStored
    : rotateVec3ByTightMat3(clock.followPanStored, corotation);
}

/**
 * Fold a WORLD-space strafe delta into `followPanStored`, converting into the
 * stored frame on the way in — `followPanWorld`'s inverse, so writers only ever
 * hold world deltas. R̃ is a rotation, so its inverse is its transpose:
 * component `i` is the dot of R̃'s COLUMN `i` with the delta (the tight
 * column-major convention `orbitAnglesLookingAlong` derives).
 */
export function addFollowPan(
  clock: CameraClock,
  worldDelta: Readonly<Vec3>,
  corotation: Readonly<Mat3> | null,
): void {
  const [wx, wy, wz] = worldDelta;
  const r = corotation;
  const dx = r === null ? wx : r[0] * wx + r[1] * wy + r[2] * wz;
  const dy = r === null ? wy : r[3] * wx + r[4] * wy + r[5] * wz;
  const dz = r === null ? wz : r[6] * wx + r[7] * wy + r[8] * wz;
  const pan = clock.followPanStored;
  clock.followPanStored = [pan[0] + dx, pan[1] + dy, pan[2] + dz];
}

/**
 * Fold a follow-while-panning strafe into `clock.followPanStored`.
 *
 * `isFollowDragFrame` is true only when a body is followed AND a drag gesture is
 * the frame's winner (orbitDrag). On such frames the frame-to-frame delta of
 * `cam.target` is PURE PAN: an orbit drag changes yaw/pitch (not target), and the
 * body's own motion never touches `cam.target`, so the delta isolates the strafe
 * with no body-motion contamination. Accumulating the delta (rather than reading
 * `cam.target - bodyPosition`) is what keeps the offset clean across a drag while
 * the body moves under it.
 *
 * Off a follow-drag frame the delta chain is dropped (`lastPanTarget = null`) so
 * the next grab continues the existing offset instead of re-basing it — and the
 * accumulated offset persists until `followElapsed` zeroes it on a fresh focus,
 * which happens the next time followBody wins the frame (see `CameraClock`).
 */
export function accumulateFollowPan(
  clock: CameraClock,
  isFollowDragFrame: boolean,
  camTarget: Vec3,
  corotation: Readonly<Mat3> | null,
): void {
  if (!isFollowDragFrame) {
    clock.lastPanTarget = null;
    return;
  }
  const last = clock.lastPanTarget;
  if (last !== null) {
    addFollowPan(
      clock,
      [camTarget[0] - last[0], camTarget[1] - last[1], camTarget[2] - last[2]],
      corotation,
    );
  }
  clock.lastPanTarget = [camTarget[0], camTarget[1], camTarget[2]];
}

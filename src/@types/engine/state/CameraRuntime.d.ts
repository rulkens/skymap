/**
 * CameraRuntime — the engine-owned mutable Resources that bridge the timeless
 * Redux store intent to the live, per-frame camera computation.
 *
 * The store (`camera` slice) holds WHAT the camera should do: a committed resting
 * pose, an optional tween descriptor, an auto-rotate config, and a drag flag. It
 * is deliberately timeless — no wall-clock values live there.
 *
 * The per-frame produce step needs four transient Resources that DO depend on
 * the passage of real time and on the precise sequence of frame-produced poses:
 *
 *   `clock`        — the `CameraClock` that converts 'this tween descriptor was
 *                    seen before' / 'auto-rotate is active' into elapsed-ms for
 *                    the driver's `pose` function. Mutated exactly once per frame
 *                    by `tweenElapsed` / `autoRotateElapsed`. Lives here, not in
 *                    the store, because it is meaningless outside the running
 *                    engine session — it would survive a serialise/restore as
 *                    stale wall-clock timestamps.
 *
 *   `projection`   — the camera's projection geometry (fovYRad, aspect, near,
 *                    far). `aspect` is patched on every canvas resize;
 *                    `assembleOrbitCamera` merges it with any produced pose into
 *                    a full `OrbitCamera` each frame. Lives here rather than in
 *                    the store because it is derived from the DOM canvas and the
 *                    FOV setting at bootstrap, not user camera intent.
 *
 *   `lastPose`     — the produced `FramedCameraPose` from the previous frame, wrapped
 *                    in a `{ current }` box so it can be updated in place without
 *                    reconstructing the reference that `wireInput` and the focus
 *                    handlers hold. The commit-on-edge logic reads this to bake
 *                    the last animated pose into `base` exactly once when a
 *                    tween/auto-rotate driver deactivates. The gesture seed also
 *                    reads it to grab the live mid-animation pose rather than the
 *                    (potentially stale) `base`.
 *
 *   `prevActiveId` — the winning driver id from the previous frame, wrapped in a
 *                    `{ current }` box. The commit-on-edge gate compares it to
 *                    the current winner to detect a driver transition exactly once
 *                    per transition frame.
 *
 *   `lastRenderedSimDays` — the sim instant (Julian days) the last frame derived
 *                    its bodies at, boxed for the same in-place-update reason as
 *                    `lastPose`. The pick path pairs it with `lastPose.current` to
 *                    re-derive the pickable bodies at the exact epoch the frame
 *                    drew them, keeping a pick target welded to its on-screen
 *                    sprite. `runFrame` is the SINGLE writer — it writes this once
 *                    per frame beside the body-snapshot prime; no other caller may
 *                    touch it, so a construction-time `deriveBodyStates(CONST_J2000)`
 *                    can never poison the pick epoch (the value-and-place braid the
 *                    old module-level memo accessor carried).
 *
 *   `upBasis`      — this frame's resolved UP basis B(t): the steady registry
 *                    basis at rest, or the mid-slerp basis while an
 *                    orientation-frame switch is in flight. (Named for what it
 *                    IS, not the generic `frameBasis` clip-authoring parameter
 *                    used elsewhere for "which basis a clip's world-space
 *                    content decodes through" — a different, wider concept;
 *                    do not conflate the two.) Boxed for the same
 *                    in-place-update reason as `lastPose`, so the saga context and
 *                    `applySceneEffect` (which read it to seed a switch's `fromQuat`)
 *                    share the live reference. `runFrame` resolves it ONCE per frame
 *                    and is its SINGLE writer — the one place that answers 'which
 *                    way is up this frame' for every reader.
 *
 * Constructed in `engine.ts` alongside `frameRef`, this bag is the single source
 * of truth for all four Resources: `wireInput`, `startLoop`, `runFrame`, and the
 * focus handlers all read from `state.cameraRuntime`, so there is no duplication
 * and no 'which copy is live?' ambiguity.
 */

import type { CameraClock } from '../camera/CameraClock';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceController } from '../../camera/SurfaceController';
import type { Mat3 } from '../../math/Mat3';

export type CameraRuntime = {
  /** The animation clock — mutated by tweenElapsed / autoRotateElapsed once per frame. */
  clock: CameraClock;
  /** Live projection config; aspect patched on each canvas resize. */
  projection: CameraProjection;
  /**
   * Last produced pose, in the arm the frame produced it in — the AUTHORITATIVE
   * pose. Boxed so wireInput and the focus handlers share the live reference.
   * Off-frame readers that need world Mpc go through `liveWorldPose`, the one
   * off-frame resolution site; nothing else re-resolves it.
   */
  lastPose: { current: FramedCameraPose };
  /** Winning driver id from the previous frame; boxed for the same reason. */
  prevActiveId: { current: string };
  /**
   * Sim instant (Julian days) the last frame derived its bodies at; boxed so the
   * pick path reads the live value. Single-writer: only `runFrame` writes it.
   */
  lastRenderedSimDays: { current: number };
  /**
   * This frame's resolved orientation basis B(t); boxed so both switch surfaces
   * (saga context + `applySceneEffect`) read the live value. Single-writer: only
   * `runFrame` writes it, once per frame from `resolveFrameBasis`.
   */
  upBasis: { current: Mat3 };
  /**
   * The body arm's gesture register — `state.cam`'s counterpart for the engaged
   * regime, and for the same reason: the latched gesture is live-session state
   * that would be meaningless serialized. `drainInput` is its only caller.
   */
  surface: SurfaceController;
};

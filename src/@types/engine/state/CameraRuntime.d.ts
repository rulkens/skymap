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
 *   `lastPose`     — the produced `CameraPose` from the previous frame, wrapped
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
 *   `surfaceFollow` — surface-fixed camera follow's hysteresis state (spec
 *                    §4.6): `engaged` gates whether `runFrame` composes
 *                    `orientationWorldDelta` into `poseBasis`/`upBasis` this
 *                    frame; `orientationAtFlip` is the focused body's
 *                    orientation SNAPSHOTTED (copied, not aliased — the body's
 *                    orientation keeps changing every frame) the instant
 *                    `engaged` flips false→true, so the composed correction
 *                    starts at identity and the engage frame introduces no
 *                    pose jump. `bodyId` is the id the other two fields
 *                    pertain to; `runFrame` resets all three the frame the
 *                    focused body id changes, so a re-focus can never carry a
 *                    stale snapshot or engaged flag onto a different body.
 *                    `runFrame` is the single writer.
 *
 * Constructed in `engine.ts` alongside `frameRef`, this bag is the single source
 * of truth for all five Resources: `wireInput`, `startLoop`, `runFrame`, and the
 * focus handlers all read from `state.cameraRuntime`, so there is no duplication
 * and no 'which copy is live?' ambiguity.
 */

import type { CameraClock } from '../camera/CameraClock';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { CameraPose } from '../../camera/CameraPose';
import type { Mat3 } from '../../math/Mat3';
import type { Vec3 } from '../../math/Vec3';
import type { OrbitControlsDebugSample } from '../../camera/OrbitControlsDebugSample';

export type CameraRuntime = {
  /** The animation clock — mutated by tweenElapsed / autoRotateElapsed once per frame. */
  clock: CameraClock;
  /** Live projection config; aspect patched on each canvas resize. */
  projection: CameraProjection;
  /** Last produced pose; boxed so wireInput and focus handlers share the live reference. */
  lastPose: { current: CameraPose };
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
   * Surface-fixed follow's hysteresis state (spec §4.6). Single-writer: only
   * `runFrame` writes it, once per frame from `surfaceFollowEngaged`.
   */
  surfaceFollow: {
    engaged: boolean;
    /** Snapshotted the frame engagement flips false→true; null while disengaged. */
    orientationAtFlip: Mat3 | null;
    /** The focused body id `engaged`/`orientationAtFlip` pertain to, or null. */
    bodyId: string | null;
  };
  /**
   * DebugPanel-only readouts (Camera section) — not read by any production
   * consumer, so unlike the Resources above there is no in-frame reader whose
   * correctness depends on write timing; the DebugPanel simply polls whatever
   * is here.
   */
  /** Last zoom tick's lateral pivot shift, Mpc. Written by `wireInput`'s `onZoom`. */
  debugZoomLateralMpc: Vec3;
  /** Last computed `liveIdleTickMs` cadence, ms. Written by `runFrame` only when the idle-tick heartbeat is armed. */
  debugIdleTickMs: number;
  /** Latest gesture/wheel sample pushed by `orbitControls.ts`'s `onDebugSample`. */
  controlsDebug: OrbitControlsDebugSample;
};

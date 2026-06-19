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
 * Constructed in `engine.ts` alongside `frameRef`, this bag is the single source
 * of truth for all four Resources: `wireInput`, `startLoop`, `runFrame`, and the
 * focus handlers all read from `state.cameraRuntime`, so there is no duplication
 * and no 'which copy is live?' ambiguity.
 */

import type { CameraClock } from '../camera/CameraClock';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { CameraPose } from '../../camera/CameraPose';

export type CameraRuntime = {
  /** The animation clock — mutated by tweenElapsed / autoRotateElapsed once per frame. */
  clock: CameraClock;
  /** Live projection config; aspect patched on each canvas resize. */
  projection: CameraProjection;
  /** Last produced pose; boxed so wireInput and focus handlers share the live reference. */
  lastPose: { current: CameraPose };
  /** Winning driver id from the previous frame; boxed for the same reason. */
  prevActiveId: { current: string };
};

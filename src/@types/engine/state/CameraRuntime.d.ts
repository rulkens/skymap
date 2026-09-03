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
 *   `lastPose`     — the AUTHORED pose register, wrapped in a `{ current }` box
 *                    so it can be updated in place without reconstructing the
 *                    reference that `wireInput` and the focus handlers hold.
 *                    Two writers, disjoint in time: `drainInput` folds gesture
 *                    steps into it at the top of the frame (so a grab
 *                    continues from the live mid-animation pose, never a stale
 *                    `base`), and `runFrame` step 4 stamps the post-pin,
 *                    PRE-projection pose. Holding the authored pose (not the
 *                    displayed one) is what keeps the register loop dead:
 *                    orbitDrag re-produces it and the pivot pin re-derives the
 *                    same eye, where a projected pose would walk ~8,500 km per
 *                    frame (R12b-1). Commit-on-edge and gestureEnd bake it
 *                    into `base` verbatim — see `commitCameraPose`'s
 *                    centre-looking invariant.
 *
 *   `displayedPose` — the pose the last frame actually DREW: `lastPose` with
 *                    the render-side tilt projection (`approachTiltedPose`)
 *                    applied. Everything that means "what is on screen" —
 *                    pick, the clip/tween live-pose seams, debug — reads THIS
 *                    (via `liveWorldPose`); everything that authors motion
 *                    reads `lastPose`. Single writer: `runFrame` step 4.
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
   * The AUTHORED pose register, in the arm it was authored in — pre-projection,
   * centre-looking while a body is focused (drain-folded during gestures,
   * produce-stamped every frame). Boxed so wireInput and the focus handlers
   * share the live reference. Off-frame authored reads go through
   * `authoredWorldPose`; nothing else re-resolves it.
   */
  lastPose: { current: FramedCameraPose };
  /**
   * The pose the last frame DREW — `lastPose` plus the render-side tilt
   * projection. On-screen reads (pick, live-pose seams, debug) resolve it via
   * `liveWorldPose`. Single writer: `runFrame` step 4.
   */
  displayedPose: { current: FramedCameraPose };
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
   * The body arm's gesture latch (mode, anchor, frozen pan radius): the
   * latched gesture is live-session state that would be meaningless
   * serialized. `drainInput` is its only caller.
   */
  surface: SurfaceController;
  /**
   * The last zoom step's factor (either arm), for the debug readout's
   * direction line; null until the first notch. `drainInput` is the writer.
   */
  lastZoomFactor: { current: number | null };
};

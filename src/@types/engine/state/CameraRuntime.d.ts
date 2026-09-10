/**
 * CameraRuntime — the engine-owned mutable Resources bridging the timeless
 * Redux `camera` slice (WHAT the camera should do) to the live per-frame
 * computation: everything here depends on wall-clock time or the exact
 * sequence of produced poses, so it would survive a serialise/restore only
 * as stale nonsense. One bag, constructed in `engine.ts`, so there is no
 * 'which copy is live?' ambiguity; the `{ current }` boxes let holders share
 * a live reference across in-place updates.
 */

import type { CameraEpochs } from '../camera/CameraEpochs';
import type { FollowMemory } from '../camera/FollowMemory';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceMemory } from '../../camera/SurfaceMemory';
import type { Mat3 } from '../../math/Mat3';

export type CameraRuntime = {
  /** Replaced once per frame by `runFrame`'s `advanceEpochs`; the clip row
   * comes from the clip player's tick. */
  epochs: CameraEpochs;
  /** `runFrame` is the only writer: the drain's returned memory, the
   * focus-edge null, then the follow driver's adopted produce. */
  follow: FollowMemory | null;
  /** Live projection config; aspect patched on each canvas resize. */
  projection: CameraProjection;
  /**
   * The AUTHORED pose register, pre-projection, centre-looking while a body is
   * focused. `runFrame` is the only writer: the replay's register at the top
   * of the frame, then step 4's post-pin pose. Authored,
   * not displayed, is what keeps the register loop dead — a projected pose
   * would walk ~8,500 km per frame (R12b-1).
   */
  lastPose: { current: FramedCameraPose };
  /** The pose the last frame DREW — `lastPose` plus the render-side tilt;
   * on-screen reads go through `liveWorldPose`. Single writer: `runFrame` step 4. */
  displayedPose: { current: FramedCameraPose };
  /** Winning driver id from the previous frame; the commit-on-edge gate's input. */
  prevActiveId: { current: string };
  /** Sim instant (Julian days) the last frame drew its bodies at; the pick path
   * re-derives against it. `runFrame` is the SINGLE writer — a construction-time
   * `deriveBodyStates(CONST_J2000)` here poisons the pick epoch. */
  lastRenderedSimDays: { current: number };
  /** This frame's resolved orientation basis B(t) — NOT the clip-authoring
   * `frameBasis` parameter. Single writer: `runFrame`, from `resolveFrameBasis`. */
  upBasis: { current: Mat3 };
  /** The body arm's gesture memory (latch + remembered tilt); `replayInput` folds
   * the gesture steps and their boundaries, `runFrame` notes the body. */
  surface: SurfaceMemory;
  /** The last zoom step's factor, for the debug readout; null until the first
   * notch. `runFrame` writes it from the replay. */
  lastZoomFactor: { current: number | null };
};

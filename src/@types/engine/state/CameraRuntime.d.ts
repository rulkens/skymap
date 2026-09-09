/**
 * CameraRuntime — the engine-owned mutable Resources bridging the timeless
 * Redux `camera` slice (WHAT the camera should do) to the live per-frame
 * computation. Everything here depends on wall-clock time or on the exact
 * sequence of frame-produced poses, so it would survive a serialise/restore
 * only as stale nonsense. Constructed in `engine.ts`; `wireInput`, `startLoop`,
 * `runFrame` and the focus handlers all read this one bag, so there is no
 * 'which copy is live?' ambiguity. The `{ current }` boxes exist so those
 * holders share the live reference across in-place updates.
 */

import type { CameraClock } from '../camera/CameraClock';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceController } from '../../camera/SurfaceController';
import type { Mat3 } from '../../math/Mat3';

export type CameraRuntime = {
  /** Mutated by tweenElapsed / autoRotateElapsed once per frame. */
  clock: CameraClock;
  /** Live projection config; aspect patched on each canvas resize. */
  projection: CameraProjection;
  /**
   * The AUTHORED pose register, in the arm it was authored in — pre-projection,
   * centre-looking while a body is focused. Two writers, disjoint in time:
   * `drainInput` folds gesture steps in at the top of the frame (so a grab
   * continues from the live mid-animation pose, never a stale `base`), and
   * `runFrame` step 4 stamps the post-pin pose. Holding the AUTHORED pose, not
   * the displayed one, is what keeps the register loop dead — a projected pose
   * would walk ~8,500 km per frame (R12b-1). Off-frame authored reads go
   * through `authoredWorldPose`.
   */
  lastPose: { current: FramedCameraPose };
  /**
   * The pose the last frame DREW — `lastPose` plus the render-side tilt
   * projection. On-screen reads (pick, live-pose seams, debug) resolve it via
   * `liveWorldPose`. Single writer: `runFrame` step 4.
   */
  displayedPose: { current: FramedCameraPose };
  /** Winning driver id from the previous frame; the commit-on-edge gate's input. */
  prevActiveId: { current: string };
  /**
   * Sim instant (Julian days) the last frame derived its bodies at. The pick
   * path pairs it with `displayedPose.current` to re-derive pickable bodies at
   * the exact epoch the frame drew them. `runFrame` is the SINGLE writer — no
   * other caller may touch it, or a construction-time
   * `deriveBodyStates(CONST_J2000)` poisons the pick epoch.
   */
  lastRenderedSimDays: { current: number };
  /**
   * This frame's resolved orientation basis B(t) — NOT the wider clip-authoring
   * `frameBasis` parameter used elsewhere; do not conflate the two. Read by the
   * saga context and `applySceneEffect` to seed a switch's `fromQuat`.
   * Single-writer: `runFrame`, once per frame from `resolveFrameBasis`.
   */
  upBasis: { current: Mat3 };
  /**
   * The body arm's gesture latch (mode, anchor, frozen pan radius): live-session
   * state that would be meaningless serialized. `drainInput` is its only caller.
   */
  surface: SurfaceController;
  /**
   * The last zoom step's factor (either arm), for the debug readout's direction
   * line; null until the first notch. `drainInput` is the writer.
   */
  lastZoomFactor: { current: number | null };
};

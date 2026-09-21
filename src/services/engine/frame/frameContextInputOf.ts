/**
 * frameContextInputOf — the one recipe from a world pose to a
 * `FrameContextInput`, and the camera assembled along the way (K2: the camera
 * travels beside the snapshot, not on it). `runFrame` (right after committing
 * `state.cameraRuntime = next`) and `pickFrameContext` (between frames) both
 * feed this the SAME `assembleOrbitCamera` + `pivotSurfaceRangeMpc` recipe;
 * `worldPose` stays each caller's own to obtain — `runFrame`'s comes free off
 * this frame's camera step, `pickFrameContext`'s off `liveWorldPose`, and
 * re-deriving it in here for both would call `deriveBodyStates` a second,
 * extra time on `runFrame`'s hot path (memoised to the same value, but the
 * ordering invariant `runFrame.test.ts`'s sim-clock suite pins is ONE call).
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameContextInput } from '../../../@types/engine/frame/FrameContextInput';
import type { AssembledOrbitCamera } from '../../../@types/camera/AssembledOrbitCamera';
import type { Mat3 } from '../../../@types/math/Mat3';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { pivotSurfaceRangeMpc } from '../camera/pivotSurfaceRangeMpc';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function frameContextInputOf(
  state: EngineState,
  args: {
    /** Each caller's own way of obtaining it — see the header. */
    readonly worldPose: CameraPose;
    /** `pick`'s clock is `performance.now()`; `runFrame`'s is its own stamp. */
    readonly nowMs: number;
    /** Draw mask (fade-out tail included) for `runFrame`; pick mask (intent
     *  only) for `pickFrameContext` — see `deriveSourceMasks`. */
    readonly visibleSourceMask: number;
    /** `runFrame` feeds the live mid-slerp basis (an orientation-frame roll in
     *  progress turns the horizon); `pickFrameContext` feeds the settled one,
     *  reading "at rest". */
    readonly upBasis: Mat3;
    /** `runFrame` feeds this frame's freshly derived instant; `pickFrameContext`
     *  feeds the instant the last DRAWN frame resolved bodies at, so pickable
     *  sprites are re-derived exactly where they were drawn. */
    readonly simDays: number;
  },
): { readonly input: FrameContextInput; readonly cam: AssembledOrbitCamera } {
  const { worldPose, nowMs, visibleSourceMask, upBasis, simDays } = args;
  // The committed pose basis — never the live one (that's `upBasis`, the
  // caller's own argument): a roll turns the horizon without moving the eye.
  const poseBasis = ORIENTATION_FRAMES[state.settings.orientation];
  // The DISPLAYED pose, not the authored register: the authored register is
  // untilted in-window and a pick against it misses (round-12c two-box
  // contract) — a plain field read, `state.cameraRuntime` already THIS
  // frame's for `runFrame` by the time it calls this.
  const arm = state.cameraRuntime.outputs.displayed;
  const cam = assembleOrbitCamera(
    worldPose,
    state.cameraRuntime.outputs.projection,
    poseBasis,
    upBasis,
  );
  // Eye→pivot-surface range NEAR0's bracket is sized from — the one line both
  // callers shared before this file existed.
  const altitudeMpc = pivotSurfaceRangeMpc(arm, worldPose.distance, state.selectionRows.focus);
  return {
    input: { cam, arm, altitudeMpc, nowMs, simDays, visibleSourceMask },
    cam,
  };
}

/**
 * CameraRuntime — the engine-owned per-frame Resources bridging the timeless
 * Redux `camera` slice (WHAT the camera should do) to the live computation:
 * everything here depends on wall-clock time or the exact sequence of produced
 * poses, so it would survive a serialise/restore only as stale nonsense. One
 * value on `EngineState`, grouped by lifetime and owner; `seedCameraRuntime` is
 * the only constructor and `runFrame` the only writer thereafter.
 */

import type { CameraEpochs } from '../camera/CameraEpochs';
import type { FollowMemory } from '../camera/FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceMemory } from '../../camera/SurfaceMemory';
import type { FrameOutputs } from './FrameOutputs';

export type CameraRuntime = {
  /**
   * The AUTHORED pose register, pre-projection, centre-looking while a body is
   * focused, and the driver id that wrote it (the commit-on-edge gate's input).
   * Authored, not displayed, is what keeps the register loop dead — a projected
   * pose would walk ~8,500 km per frame (R12b-1); the displayed pose is
   * `outputs.displayed`.
   */
  readonly register: { readonly pose: FramedCameraPose; readonly winner: string };
  /** Replaced once per frame by `runFrame`'s `advanceEpochs`; the clip row
   * comes from the clip player's tick. */
  readonly epochs: CameraEpochs;
  /** `runFrame` is the only writer: the drain's returned memory, the
   * focus-edge null, then the follow driver's adopted produce. */
  readonly follow: FollowMemory | null;
  /** The body arm's gesture memory (latch + remembered tilt); `replayInput` folds
   * the gesture steps and their boundaries, `runFrame` notes the body. */
  readonly surface: SurfaceMemory;
  readonly outputs: FrameOutputs;
};

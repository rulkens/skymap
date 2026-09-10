/**
 * CameraRuntime — the engine-owned per-frame Resources bridging the timeless
 * Redux `camera` slice (WHAT the camera should do) to the live computation:
 * everything here depends on wall-clock time or the sequence of produced poses,
 * so it would survive a serialise/restore only as stale nonsense. One value on
 * `EngineState`, grouped by lifetime and owner; `seedCameraRuntime` is the only
 * constructor, `runFrame` the only writer (once per frame, `stepCameraRuntime`).
 */

import type { CameraEpochs } from '../camera/CameraEpochs';
import type { FollowMemory } from '../camera/FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceMemory } from '../../camera/SurfaceMemory';
import type { FrameOutputs } from './FrameOutputs';

export type CameraRuntime = {
  /**
   * The AUTHORED pose (pre-projection — a projected one walks ~8,500 km/frame,
   * R12b-1) and the driver id that wrote it.
   */
  readonly register: { readonly pose: FramedCameraPose; readonly winner: string };
  readonly epochs: CameraEpochs;
  readonly follow: FollowMemory | null;
  readonly surface: SurfaceMemory;
  readonly outputs: FrameOutputs;
};

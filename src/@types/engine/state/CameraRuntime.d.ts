/**
 * CameraRuntime — the camera's live half: everything that depends on wall-clock
 * time or on the sequence of produced poses, which is why it is not in the
 * timeless Redux `camera` slice. `seedCameraRuntime` is the only constructor,
 * `runFrame` the only writer (once per frame, through `stepCameraRuntime`).
 */

import type { CameraEpochs } from '../camera/CameraEpochs';
import type { DriverId } from '../camera/DriverId';
import type { FollowMemory } from '../camera/FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SurfaceMemory } from '../../camera/SurfaceMemory';
import type { FrameOutputs } from './FrameOutputs';

export type CameraRuntime = {
  /** The AUTHORED pose (pre-projection — a projected one walks ~8,500 km/frame,
   * R12b-1) and the driver id that wrote it. */
  readonly register: { readonly pose: FramedCameraPose; readonly winner: DriverId };
  readonly epochs: CameraEpochs;
  readonly follow: FollowMemory | null;
  readonly surface: SurfaceMemory;
  readonly outputs: FrameOutputs;
};

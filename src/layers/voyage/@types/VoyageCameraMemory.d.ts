/**
 * VoyageCameraMemory — the voyage driver's private slot (`CameraRuntime.own`). `aim` is the re-aim
 * token `view` belongs to: a new one (entry, destination tab) restarts the view and drops
 * `offsets`, the visitor's orbit and zoom as of their last input. In `view`, `arrived` is whether
 * the view last shown framed the destination galaxy rather than riding the ship; `from` the pose an
 * in-progress ease started on at `easeAtMs`, ms on the aim epoch.
 */

import type { CameraAim } from '../../../@types/camera/CameraAim';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { MissionOffsets } from '../../../@types/camera/MissionOffsets';

export type VoyageCameraMemory = {
  readonly aim: CameraAim | null;
  readonly offsets: MissionOffsets;
  readonly view: {
    readonly arrived: boolean;
    readonly from: CameraPose | null;
    readonly easeAtMs: number;
  } | null;
};

/**
 * MissionCameraMemory — the mission driver's private slot (`CameraRuntime.own`). `aim` is the
 * re-aim token `view` belongs to: a new one (entry, step, craft switch) restarts the view, whose
 * times are on that token's epoch, ms. `offsets` are the visitor's orbit and zoom as of their last
 * input; an easing re-aim keeps them, an entry drops them. In `view`, `stop` / `cruise` are the
 * view last shown; `from` the pose an in-progress ease started on at `easeAtMs`, with `shortfall`
 * its distance over the craft's fit (≤ 1, 1 = the craft was in view).
 */

import type { CameraAim } from './CameraAim';
import type { CameraPose } from './CameraPose';
import type { MissionOffsets } from './MissionOffsets';
import type { MissionStop } from '../missions/MissionStop';

export type MissionCameraMemory = {
  readonly aim: CameraAim | null;
  readonly offsets: MissionOffsets;
  readonly view: {
    readonly stop: MissionStop | null;
    readonly cruise: boolean;
    readonly from: CameraPose | null;
    readonly easeAtMs: number;
    readonly shortfall: number;
  } | null;
};

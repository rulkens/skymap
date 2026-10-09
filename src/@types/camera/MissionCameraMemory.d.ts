/**
 * MissionCameraMemory — what the mission driver carries between frames for one mission record
 * (`stops` by identity: an entry, step or craft switch builds a new one, so the memory restarts).
 * `stop` / `cruise` are the view last shown; `from` the pose an in-progress view ease started on
 * at `easeAtMs`, with `shortfall` its distance over the craft's fit (≤ 1, 1 = the craft was in
 * view); `inputAtMs` the visitor's last orbit or zoom. Times are on the mission epoch, ms.
 */

import type { CameraPose } from './CameraPose';
import type { MissionStop } from '../missions/MissionStop';

export type MissionCameraMemory = {
  readonly stops: readonly MissionStop[];
  readonly stop: MissionStop | null;
  readonly cruise: boolean;
  readonly from: CameraPose | null;
  readonly easeAtMs: number;
  readonly shortfall: number;
  readonly inputAtMs: number;
};

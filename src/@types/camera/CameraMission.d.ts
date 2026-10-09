/**
 * CameraMission — the craft the mission camera follows through its stops. `cruise` is the
 * exhibit pose's bearing (yaw/pitch in the pose basis), the view direction away from planets;
 * `offsets` are the visitor's orbit and zoom inside the frame and reset on every step.
 * `speedIndex` is the `MISSION_SPEEDS` factor the clock plays at. `retarget` counts the steps
 * and craft switches: each bump makes the camera ease to the new frame instead of cutting.
 */

import type { MissionStop } from '../missions/MissionStop';
import type { MissionOffsets } from './MissionOffsets';

export type CameraMission = {
  readonly craftId: string;
  readonly stops: readonly MissionStop[];
  readonly cruise: { readonly yaw: number; readonly pitch: number };
  readonly offsets: MissionOffsets;
  readonly speedIndex: number;
  readonly retarget: number;
};

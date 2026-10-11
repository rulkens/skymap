/**
 * CameraMission — the craft the mission camera follows through its stops. `cruise` is the
 * exhibit pose's bearing (yaw/pitch in the pose basis), the view direction away from planets;
 * `offsets` are the visitor's orbit and zoom inside the frame as of their last input; they
 * outlive steps and hand-offs, holding until the next view change.
 * `speedIndex` is the `MISSION_SPEEDS` factor the clock plays at. A new record restarts the
 * mission epoch; `reaim` marks one made by a step, craft switch or mid-fly-in re-aim, which eases
 * to the new frame, where the entry record cuts or arrives on its fly-in.
 */

import type { MissionStop } from '../missions/MissionStop';
import type { MissionOffsets } from './MissionOffsets';

export type CameraMission = {
  readonly craftId: string;
  readonly stops: readonly MissionStop[];
  readonly cruise: { readonly yaw: number; readonly pitch: number };
  readonly offsets: MissionOffsets;
  readonly speedIndex: number;
  readonly reaim: boolean;
};

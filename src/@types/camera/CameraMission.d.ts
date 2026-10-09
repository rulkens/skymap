/**
 * CameraMission — the craft the mission camera follows through its stops. `cruise` is the
 * exhibit pose's bearing (yaw/pitch in the pose basis), the view direction away from planets;
 * `offsets` are the visitor's orbit and zoom inside the frame and reset on every step.
 */

import type { MissionStop } from '../missions/MissionStop';

export type CameraMission = {
  readonly craftId: string;
  readonly stops: readonly MissionStop[];
  readonly cruise: { readonly yaw: number; readonly pitch: number };
  readonly offsets: {
    readonly yaw: number;
    readonly pitch: number;
    readonly zoom: number;
  };
};

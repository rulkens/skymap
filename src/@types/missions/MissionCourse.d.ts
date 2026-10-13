/**
 * MissionCourse — the craft the mission camera follows through its stops, and `cruise`, the
 * bearing (yaw/pitch in the pose basis) it looks along away from planets.
 */

import type { MissionStop } from './MissionStop';

export type MissionCourse = {
  readonly craftId: string;
  readonly stops: readonly MissionStop[];
  readonly cruise: { readonly yaw: number; readonly pitch: number };
};

/**
 * MissionTimeline — a scrubbable mission timeline in the notes column. `crafts` is the tab
 * order (`[0]` opens) and every craft needs a trail; `events` are only the listed crafts'. The
 * axis runs from the selected craft's launch to `endIso`, or to the wall clock at opening.
 * `cruise` is the bearing (yaw/pitch in the pose basis) the mission camera looks along away from
 * planets.
 */

import type { MissionEvent } from '../missions/MissionEvent';

export type MissionTimeline = {
  readonly heading: string;
  readonly crafts: readonly { readonly bodyId: string; readonly label: string }[];
  readonly events: readonly MissionEvent[];
  readonly endIso?: string;
  readonly cruise: { readonly yaw: number; readonly pitch: number };
};

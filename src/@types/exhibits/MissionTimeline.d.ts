/**
 * MissionTimeline — a scrubbable mission timeline in the notes column. `crafts` is the tab
 * order (`[0]` opens) and every craft needs a trail; `events` are only the listed crafts'. The
 * axis runs from the selected craft's launch to `endIso`, or to the wall clock at opening.
 */

import type { MissionEvent } from '../missions/MissionEvent';

export type MissionTimeline = {
  readonly heading: string;
  readonly crafts: readonly { readonly bodyId: string; readonly label: string }[];
  readonly events: readonly MissionEvent[];
  readonly endIso?: string;
};

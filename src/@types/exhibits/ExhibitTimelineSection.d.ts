/**
 * ExhibitTimelineSection — a scrubbable mission timeline in the notes column. `crafts` is the tab
 * order; the lanes are the events' `bodyId`s. The axis runs from the selected craft's launch to now.
 */

import type { MissionEvent } from '../missions/MissionEvent';

export type ExhibitTimelineSection = {
  readonly heading: string;
  readonly events: readonly MissionEvent[];
  readonly crafts: readonly string[];
};

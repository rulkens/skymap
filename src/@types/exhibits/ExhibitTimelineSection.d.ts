/**
 * ExhibitTimelineSection — a scrubbable mission timeline in the notes column. `crafts` is the tab
 * order; the lanes are the events' `bodyId`s. The axis runs from the selected craft's launch to now.
 */

import type { MissionEvent } from '../missions/MissionEvent';
import type { ExhibitTimelineCraft } from './ExhibitTimelineCraft';

export type ExhibitTimelineSection = {
  readonly kind: 'timeline';
  readonly heading: string;
  readonly events: readonly MissionEvent[];
  readonly crafts: readonly ExhibitTimelineCraft[];
};

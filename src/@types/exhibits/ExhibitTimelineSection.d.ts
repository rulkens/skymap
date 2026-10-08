/**
 * ExhibitTimelineSection — a scrubbable mission timeline in the notes column. `crafts` is the tab
 * order; the lanes are the events' `bodyId`s. The axis starts at `eras[0].fromIso`.
 */

import type { MissionEvent } from '../missions/MissionEvent';
import type { ExhibitTimelineCraft } from './ExhibitTimelineCraft';
import type { TimelineEra } from './TimelineEra';

export type ExhibitTimelineSection = {
  readonly kind: 'timeline';
  readonly heading: string;
  readonly events: readonly MissionEvent[];
  readonly crafts: readonly ExhibitTimelineCraft[];
  readonly eras: readonly TimelineEra[];
};

/**
 * ExhibitTimelineSection — a scrubbable mission timeline in the notes column. Lanes derive
 * from the events' `bodyId`s; `captions` are authored copy keyed by `MissionEvent.id`, since
 * the events file is measured data. The axis starts at `eras[0].fromIso`.
 */

import type { MissionEvent } from '../missions/MissionEvent';
import type { TimelineEra } from './TimelineEra';

export type ExhibitTimelineSection = {
  readonly kind: 'timeline';
  readonly heading: string;
  readonly events: readonly MissionEvent[];
  readonly eras: readonly TimelineEra[];
  readonly captions: Readonly<Record<string, string>>;
};

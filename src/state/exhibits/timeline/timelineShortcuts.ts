import { stepTimelineSpeed } from '../../settings/core/timelineSlice';
import { stepTimelineEvent } from './stepTimelineEvent';
import type { KeyboardShortcut } from '../../../@types/state/input/KeyboardShortcut';
import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';

/**
 * A timeline exhibit's keys, ahead of the global table: `[` / `]` step the timeline speed factor
 * (the transport shows it, not the rate ladder), `,` / `.` the previous / next event, a
 * focus-free way to drive the timeline since `tab` is taken. No `preventDefault`.
 */
export const timelineShortcuts: readonly KeyboardShortcut<ExhibitTimelineData>[] = [
  { keys: '[', run: () => stepTimelineSpeed({ step: -1 }) },
  { keys: ']', run: () => stepTimelineSpeed({ step: 1 }) },
  { keys: ',', run: (s, timeline) => stepTimelineEvent(s, timeline, -1) },
  { keys: '.', run: (s, timeline) => stepTimelineEvent(s, timeline, 1) },
];

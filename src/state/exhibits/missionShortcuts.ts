import { stepMissionSpeed } from '../settings/core/missions/slice';
import { stepTimelineEvent } from './stepTimelineEvent';
import type { KeyboardShortcut } from '../../@types/state/input/KeyboardShortcut';
import type { MissionTimeline } from '../../@types/exhibits/MissionTimeline';

/**
 * A timeline exhibit's keys, ahead of the global table: `[` / `]` step the mission speed factor
 * (the transport shows it, not the rate ladder), `,` / `.` the previous / next event, a
 * focus-free way to drive the timeline since `tab` is taken. No `preventDefault`.
 */
export const missionShortcuts: readonly KeyboardShortcut<MissionTimeline>[] = [
  { keys: '[', run: () => stepMissionSpeed({ step: -1 }) },
  { keys: ']', run: () => stepMissionSpeed({ step: 1 }) },
  { keys: ',', run: (s, timeline) => stepTimelineEvent(s, timeline, -1) },
  { keys: '.', run: (s, timeline) => stepTimelineEvent(s, timeline, 1) },
];

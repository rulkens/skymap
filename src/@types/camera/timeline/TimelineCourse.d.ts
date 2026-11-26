/**
 * TimelineCourse — the craft the timeline camera follows through its stops, and `cruise`, the
 * bearing (yaw/pitch in the pose basis) it looks along away from planets.
 */

import type { TimelineStop } from './TimelineStop';

export type TimelineCourse = {
  readonly craftId: string;
  readonly stops: readonly TimelineStop[];
  readonly cruise: { readonly yaw: number; readonly pitch: number };
};

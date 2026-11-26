/**
 * TimelineStop — one boundary of a craft's legs: events less than a day apart share one.
 * `planetId` is what the camera frames there (Earth at launch, the planet flown past or named,
 * null for a heliosphere or milestone stop); `encounter` is that planet's flyby, null at launch.
 */

import type { TimelineEvent } from '../../exhibits/timeline/TimelineEvent';

export type TimelineStop = {
  /** Unix ms of the stop's first event: the leg boundary on the axis and on the clock. */
  readonly ms: number;
  readonly events: readonly TimelineEvent[];
  readonly planetId: string | null;
  readonly encounter: TimelineEvent | null;
};

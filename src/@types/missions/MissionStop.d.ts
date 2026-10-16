/**
 * MissionStop — one boundary of a craft's mission legs: events less than a day apart share one.
 * `planetId` is what the camera frames there (Earth at launch, the planet flown past, null for
 * a heliosphere or milestone stop); `encounter` is that planet's flyby, null at launch.
 */

import type { MissionEvent } from './MissionEvent';

export type MissionStop = {
  /** Unix ms of the stop's first event: the leg boundary on the axis and on the clock. */
  readonly ms: number;
  readonly events: readonly MissionEvent[];
  readonly planetId: string | null;
  readonly encounter: MissionEvent | null;
};

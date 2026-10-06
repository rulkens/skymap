import type { FlightSpan } from './FlightSpan';

/** The flight's scroll map: `units` is its length in viewport heights, `spans` one per stop plus the arrival. */
export type FlightTimeline = {
  units: number;
  spans: readonly FlightSpan[];
};

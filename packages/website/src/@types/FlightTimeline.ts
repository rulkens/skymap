import type { FlightKnot } from './FlightKnot';

/** The flight's scroll map: `units` is its length in viewport heights, `knots` one per stop plus the film's end. */
export type FlightTimeline = {
  units: number;
  knots: readonly FlightKnot[];
};

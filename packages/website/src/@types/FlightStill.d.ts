import type { FlightStillSources } from './FlightStillSources';

/** A flight stop's picture: a 9:16 crop for upright screens and the full frame for the rest. */
export type FlightStill = {
  portrait: FlightStillSources;
  landscape: FlightStillSources;
};

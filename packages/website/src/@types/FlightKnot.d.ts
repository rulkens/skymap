/**
 * One point the flight's scroll map passes through: at scroll fraction `at`
 * (0 to 1) the film is at `sec`, moving at `slope` seconds per unit of scroll.
 * There is one per stop, then one for the film's end.
 */
export type FlightKnot = {
  at: number;
  sec: number;
  slope: number;
};

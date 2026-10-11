/**
 * One stop's share of the flight's scroll, as fractions of the whole (0 to 1).
 * From `start` to `dwellEnd` the picture rests on the stop; from there to `end`
 * the film runs from `atSec` to `nextSec`, and from `fadeStart` the next stop's
 * still fades in. The last span is the arrival: it rests on the film's final frame.
 */
export type FlightSpan = {
  start: number;
  dwellEnd: number;
  fadeStart: number;
  end: number;
  atSec: number;
  nextSec: number;
};

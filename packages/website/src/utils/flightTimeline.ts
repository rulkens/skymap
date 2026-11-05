import type { FlightTimeline } from '../@types/FlightTimeline';

// Scroll between two stops, in viewport heights: a fixed share so captions come
// at an even pace, plus a little per film second so a long leg is not a blur.
const LEG_BASE = 0.7;
const LEG_PER_SEC = 0.04;
const LEG_MAX = 1.5;
// From the last stop to the film's end, where the closing words come up.
const LEG_ARRIVAL = 0.6;
// The film's speed at the two ends, as a share of its first and last leg's average.
const END_EASE = 0.5;

/**
 * Lay the stops out along the scroll, with the film's speed at each. The film
 * never rests: where two legs run at different speeds the stop between them
 * takes their harmonic mean, which keeps the curve through the knots rising
 * everywhere (Fritsch and Carlson's condition for a monotone cubic).
 */
export function flightTimeline(stopSecs: readonly number[], duration: number): FlightTimeline {
  const secs = [...stopSecs, duration];
  const legs = stopSecs.map((atSec, i) =>
    i === stopSecs.length - 1
      ? LEG_ARRIVAL
      : Math.min(LEG_MAX, LEG_BASE + (secs[i + 1]! - atSec) * LEG_PER_SEC),
  );
  const units = legs.reduce((sum, leg) => sum + leg, 0);
  const speeds = legs.map((leg, i) => ((secs[i + 1]! - secs[i]!) * units) / leg);

  let at = 0;
  const knots = secs.map((sec, i) => {
    const before = speeds[i - 1];
    const after = speeds[i];
    const slope =
      before === undefined
        ? after! * END_EASE
        : after === undefined
          ? before * END_EASE
          : (2 * before * after) / (before + after);
    const knot = { at: at / units, sec, slope };
    at += legs[i] ?? 0;
    return knot;
  });
  knots[knots.length - 1]!.at = 1;
  return { units, knots };
}

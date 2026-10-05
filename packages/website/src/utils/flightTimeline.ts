import type { FlightSpan } from '../@types/FlightSpan';
import type { FlightTimeline } from '../@types/FlightTimeline';

// All in viewport heights of scroll. A stop rests long enough to read two lines;
// the first rests briefly, because its words are already on screen at load.
const REST = 0.5;
const FIRST_REST = 0.25;
const ARRIVAL_REST = 0.7;
// Film seconds become scroll at this rate, within limits, so the 20 s pull-back
// from Earth is not a blur and a 3 s hop is not a twitch.
const TRAVEL_PER_SEC = 0.06;
const TRAVEL_MIN = 0.35;
const TRAVEL_MAX = 1.1;
// The next still fades in over the end of the travel, never longer than this.
const FADE = 0.35;

/**
 * Lay the stops out along the scroll. Every stop gets a rest and a travel to
 * the next one (the last travels to the film's end, where the arrival rests),
 * so captions are evenly paced however unevenly the recording moves.
 */
export function flightTimeline(stopSecs: readonly number[], duration: number): FlightTimeline {
  const raw = stopSecs.map((atSec, i) => {
    const nextSec = stopSecs[i + 1] ?? duration;
    const travel = Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, (nextSec - atSec) * TRAVEL_PER_SEC));
    return { atSec, nextSec, rest: i === 0 ? FIRST_REST : REST, travel };
  });
  raw.push({ atSec: duration, nextSec: duration, rest: ARRIVAL_REST, travel: 0 });

  const units = raw.reduce((sum, r) => sum + r.rest + r.travel, 0);
  let at = 0;
  const spans: FlightSpan[] = raw.map((r) => {
    const start = at;
    at += r.rest + r.travel;
    return {
      start: start / units,
      dwellEnd: (start + r.rest) / units,
      fadeStart: (at - Math.min(FADE, r.travel)) / units,
      end: at / units,
      atSec: r.atSec,
      nextSec: r.nextSec,
    };
  });
  spans[spans.length - 1]!.end = 1;
  return { units, spans };
}

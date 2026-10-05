import type { FlightPose } from '../@types/FlightPose';
import type { FlightTimeline } from '../@types/FlightTimeline';

const unit = (v: number): number => Math.max(0, Math.min(1, v));

/** The flight's pose at scroll fraction `p` (0 to 1): the one function both the stills and the film follow. */
export function flightAt(timeline: FlightTimeline, p: number): FlightPose {
  const { spans } = timeline;
  const found = spans.findIndex((s) => p < s.end);
  const index = found < 0 ? spans.length - 1 : found;
  const span = spans[index]!;
  if (p <= span.dwellEnd || span.end === span.dwellEnd) {
    return { index, travel: 0, mix: 0, sec: span.atSec };
  }
  const travel = unit((p - span.dwellEnd) / (span.end - span.dwellEnd));
  return {
    index,
    travel,
    mix: unit((p - span.fadeStart) / (span.end - span.fadeStart)),
    sec: span.atSec + (span.nextSec - span.atSec) * travel,
  };
}

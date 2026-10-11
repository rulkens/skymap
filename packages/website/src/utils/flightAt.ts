import type { FlightPose } from '../@types/FlightPose';
import type { FlightTimeline } from '../@types/FlightTimeline';

/**
 * The flight's pose at scroll fraction `p` (0 to 1): the one function the
 * stills, the captions and the film all follow. Film time is a cubic Hermite
 * curve through the knots, so its speed changes gradually and is never zero.
 */
export function flightAt(timeline: FlightTimeline, p: number): FlightPose {
  const { knots } = timeline;
  const last = knots.length - 1;
  if (p <= 0) return { index: 0, travel: 0, sec: knots[0]!.sec };
  if (p >= 1) return { index: last, travel: 0, sec: knots[last]!.sec };
  const index = Math.max(0, knots.findIndex((k) => p < k.at) - 1);
  const a = knots[index]!;
  const b = knots[index + 1]!;
  const width = b.at - a.at;
  const u = (p - a.at) / width;
  const sec =
    (2 * u ** 3 - 3 * u ** 2 + 1) * a.sec +
    (u ** 3 - 2 * u ** 2 + u) * width * a.slope +
    (3 * u ** 2 - 2 * u ** 3) * b.sec +
    (u ** 3 - u ** 2) * width * b.slope;
  return { index, travel: u, sec };
}

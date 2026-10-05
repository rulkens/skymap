/**
 * The scroll map is the one thing the stills, the captions and the film all
 * follow. A gap or a jump between spans shows as a flash, a film that runs
 * backwards, or a last caption that never clears before the closing block.
 */
import { describe, expect, it } from 'vitest';

import { FLIGHT_STOPS } from '../../../packages/website/src/data/flightStops';
import { flightAt } from '../../../packages/website/src/utils/flightAt';
import { flightTimeline } from '../../../packages/website/src/utils/flightTimeline';
import { HERO_MEDIA } from '../../../tools/site/heroMediaPlan';

const duration = HERO_MEDIA.outSec - HERO_MEDIA.inSec;
const timeline = flightTimeline(
  FLIGHT_STOPS.map((s) => s.atSec),
  duration,
);
const STEPS = 4000;

describe('flight timeline', () => {
  it('covers the scroll from 0 to 1 with one span per stop and an arrival, no gaps', () => {
    expect(timeline.spans).toHaveLength(FLIGHT_STOPS.length + 1);
    expect(timeline.spans[0]!.start).toBe(0);
    expect(timeline.spans.at(-1)!.end).toBe(1);
    timeline.spans.forEach((span, i) => {
      if (i > 0) expect(span.start).toBeCloseTo(timeline.spans[i - 1]!.end, 10);
      expect(span.dwellEnd).toBeGreaterThan(span.start);
      expect(span.fadeStart).toBeGreaterThanOrEqual(span.dwellEnd - 1e-9);
      expect(span.end).toBeGreaterThanOrEqual(span.fadeStart);
    });
  });

  it('starts on the first frame at rest and ends on the last, in the arrival', () => {
    expect(flightAt(timeline, 0)).toEqual({ index: 0, travel: 0, mix: 0, sec: 0 });
    expect(flightAt(timeline, 1)).toEqual({
      index: FLIGHT_STOPS.length,
      travel: 0,
      mix: 0,
      sec: duration,
    });
  });

  it('the film never runs backwards and never jumps more than the step allows', () => {
    let last = flightAt(timeline, 0);
    for (let k = 1; k <= STEPS; k++) {
      const pose = flightAt(timeline, k / STEPS);
      expect(pose.sec).toBeGreaterThanOrEqual(last.sec);
      expect(pose.sec - last.sec).toBeLessThan(1);
      expect(pose.index - last.index === 0 || pose.index - last.index === 1).toBe(true);
      last = pose;
    }
  });

  it('each stop rests exactly on its own second, with the next still fully in as it hands over', () => {
    timeline.spans.slice(0, -1).forEach((span, i) => {
      const rest = flightAt(timeline, (span.start + span.dwellEnd) / 2);
      expect(rest).toEqual({ index: i, travel: 0, mix: 0, sec: FLIGHT_STOPS[i]!.atSec });
      const leaving = flightAt(timeline, span.end - 1e-9);
      expect(leaving.index).toBe(i);
      expect(leaving.mix).toBeCloseTo(1, 5);
      expect(leaving.sec).toBeCloseTo(span.nextSec, 5);
    });
  });
});

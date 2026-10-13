/**
 * The scroll map is the one thing the stills, the captions and the film all
 * follow. A flat stretch in it is a picture that stops under a moving finger;
 * a jump is a flash; weights that do not sum to one let the black behind the
 * stills through.
 */
import { describe, expect, it } from 'vitest';

import { FLIGHT_STOPS } from '../../../packages/website/src/data/flightStops';
import { flightAt } from '../../../packages/website/src/utils/flightAt';
import { flightStillWeights } from '../../../packages/website/src/utils/flightStillWeights';
import { flightTimeline } from '../../../packages/website/src/utils/flightTimeline';
import { HERO_MEDIA } from '../../../tools/site/heroMediaPlan';

const duration = HERO_MEDIA.outSec - HERO_MEDIA.inSec;
const timeline = flightTimeline(
  FLIGHT_STOPS.map((s) => s.atSec),
  duration,
);
const STEPS = 4000;

describe('flight timeline', () => {
  it('has one knot per stop and one for the film’s end, from 0 to 1 in order', () => {
    expect(timeline.knots).toHaveLength(FLIGHT_STOPS.length + 1);
    expect(timeline.knots[0]!.at).toBe(0);
    expect(timeline.knots.at(-1)).toMatchObject({ at: 1, sec: duration });
    timeline.knots.slice(1).forEach((knot, i) => {
      expect(knot.at).toBeGreaterThan(timeline.knots[i]!.at);
    });
  });

  it('passes each stop on its own second', () => {
    FLIGHT_STOPS.forEach((stop, i) => {
      const pose = flightAt(timeline, timeline.knots[i]!.at);
      expect(pose.sec).toBeCloseTo(stop.atSec, 9);
    });
    expect(flightAt(timeline, 0)).toEqual({ index: 0, travel: 0, sec: 0 });
    expect(flightAt(timeline, 1)).toEqual({ index: FLIGHT_STOPS.length, travel: 0, sec: duration });
  });

  it('film time rises with every step of scroll: no rest, no jump', () => {
    // An even scrub would move duration / STEPS per step. The slowest stretch is the last
    // leg, where the recording itself is coming to a halt; even there it keeps moving.
    const even = duration / STEPS;
    let last = flightAt(timeline, 0).sec;
    for (let k = 1; k <= STEPS; k++) {
      const { sec } = flightAt(timeline, k / STEPS);
      expect(sec - last).toBeGreaterThan(even * 0.02);
      expect(sec - last).toBeLessThan(even * 4);
      last = sec;
    }
  });

  it('between the first stop and the last, no stretch runs slower than a third of an even scrub', () => {
    const from = Math.ceil(timeline.knots[0]!.at * STEPS) + 40;
    const to = Math.floor(timeline.knots.at(-2)!.at * STEPS) - 40;
    const even = duration / STEPS;
    for (let k = from; k < to; k++) {
      const step = flightAt(timeline, (k + 1) / STEPS).sec - flightAt(timeline, k / STEPS).sec;
      expect(step).toBeGreaterThan(even / 3);
    }
  });

  it('the stills’ weights sum to one and never jump, across every stop', () => {
    const stills = FLIGHT_STOPS.length;
    let last = flightStillWeights(flightAt(timeline, 0), stills);
    expect(last[0]).toBe(1);
    for (let k = 1; k <= STEPS; k++) {
      const weights = flightStillWeights(flightAt(timeline, k / STEPS), stills);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 12);
      expect(weights.filter((w) => w > 0).length).toBeLessThanOrEqual(2);
      weights.forEach((w, i) => expect(Math.abs(w - last[i]!)).toBeLessThan(0.02));
      last = weights;
    }
    expect(last[stills - 1]).toBe(1);
  });

  it('each still is alone at its own stop', () => {
    FLIGHT_STOPS.forEach((_, i) => {
      const weights = flightStillWeights(
        flightAt(timeline, timeline.knots[i]!.at),
        FLIGHT_STOPS.length,
      );
      expect(weights[i]).toBeCloseTo(1, 9);
    });
  });
});

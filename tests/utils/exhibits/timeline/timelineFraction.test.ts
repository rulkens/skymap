import { describe, it, expect } from 'vitest';

import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { timelineAxis } from '../../../../src/utils/exhibits/timeline/timelineAxis';
import { timelineFraction } from '../../../../src/utils/exhibits/timeline/timelineFraction';
import { timelineInstant } from '../../../../src/utils/exhibits/timeline/timelineInstant';

const END = Date.parse('2026-10-06');
const v1 = MISSION_EVENTS.filter((e) => e.bodyId === 'voyager1');
const stops = missionStops(v1);
const axis = timelineAxis(stops, END);
const at = (id: string) => Date.parse(v1.find((e) => e.id === id)!.iso);

describe('equal-leg mission axis', () => {
  it('merges Titan and Saturn into one stop, so they share one boundary', () => {
    const merged = stops.find((s) => s.events.some((e) => e.id === 'voyager1-titan'))!;
    expect(merged.events.map((e) => e.id)).toEqual(['voyager1-titan', 'voyager1-saturn']);
    expect(merged.planetId).toBe('saturn');
    expect(axis.boundsMs).toHaveLength(v1.length); // 8 events − 1 merge + the end
  });

  it('gives every leg the same width, the last (to now) included', () => {
    const legs = axis.boundsMs.length - 1;
    axis.boundsMs.forEach((ms, i) => expect(timelineFraction(ms, axis)).toBeCloseTo(i / legs, 12));
  });

  it('clamps at launch and at now', () => {
    expect(timelineFraction(at('voyager1-launch') - 1e9, axis)).toBe(0);
    expect(timelineInstant(-0.2, axis)).toBe(at('voyager1-launch'));
    expect(timelineInstant(1.2, axis)).toBe(END);
  });

  it('timelineInstant inverts timelineFraction inside every leg', () => {
    for (const iso of ['1978-01-01', '1980-01-01', '1985-01-01', '2000-01-01', '2020-01-01']) {
      const ms = Date.parse(iso);
      expect(timelineInstant(timelineFraction(ms, axis), axis)).toBeCloseTo(ms, -1);
    }
  });
});

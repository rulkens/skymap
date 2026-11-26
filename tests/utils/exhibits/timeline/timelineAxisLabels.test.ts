import { describe, it, expect } from 'vitest';

import { timelineAxisLabels } from '../../../../src/utils/exhibits/timeline/timelineAxisLabels';
import { timelineAxis } from '../../../../src/utils/exhibits/timeline/timelineAxis';
import { timelineStops } from '../../../../src/utils/camera/timeline/timelineStops';
import { MISSION_EVENTS } from '../../../../src/layers/missions/events/data/missionEvents.generated';

// One short leg, as an asteroid's close pass would have.
const axis = { boundsMs: [Date.parse('2026-08-20T00:00:00Z'), Date.parse('2026-12-07T00:00:00Z')] };

describe('timelineAxisLabels', () => {
  it('writes month and year on an axis shorter than two years', () => {
    expect(timelineAxisLabels(axis, '2026-12-07T00:00:00Z').map((l) => l.text)).toEqual([
      'Aug 2026',
      'Dec 2026',
    ]);
  });

  it("writes an open end as 'now'", () => {
    expect(timelineAxisLabels(axis, undefined).at(-1)).toEqual({ fraction: 1, text: 'now' });
  });

  it('writes years on a mission-long axis', () => {
    const stops = timelineStops(MISSION_EVENTS.filter((e) => e.bodyId === 'voyager1'));
    const labels = timelineAxisLabels(
      timelineAxis(stops, Date.parse('2026-11-26T00:00:00Z')),
      undefined,
    );
    expect(labels.map((l) => l.text)).toEqual([
      '1977',
      '1979',
      '1980',
      '1990',
      '2004',
      '2012',
      'now',
    ]);
  });
});

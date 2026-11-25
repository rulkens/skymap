import { describe, it, expect } from 'vitest';

import { timelineAxisLabels } from '../../../../src/utils/exhibits/timeline/timelineAxisLabels';

// One short leg, as an asteroid's close pass would have: the end label is the only thing that differs.
const axis = { boundsMs: [Date.parse('2026-08-20T00:00:00Z'), Date.parse('2026-12-07T00:00:00Z')] };

describe('timelineAxisLabels end', () => {
  it("writes an authored end as its date in the axis's year format", () => {
    expect(timelineAxisLabels(axis, '2026-12-07T00:00:00Z').at(-1)).toEqual({
      fraction: 1,
      text: '2026',
    });
  });

  it("writes an open end as 'now'", () => {
    expect(timelineAxisLabels(axis, undefined).at(-1)).toEqual({ fraction: 1, text: 'now' });
  });
});

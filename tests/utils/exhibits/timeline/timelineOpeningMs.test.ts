import { describe, it, expect } from 'vitest';

import { timelineOpeningMs } from '../../../../src/utils/exhibits/timeline/timelineOpeningMs';

const FIRST = Date.parse('2026-02-01T00:00:00Z');
const END = '2027-01-15T00:00:00Z';

describe('timelineOpeningMs', () => {
  it('opens on the wall clock while an authored timeline runs', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    expect(timelineOpeningMs(END, FIRST, now)).toBe(now);
  });

  it('opens on the first stop before or after the authored span', () => {
    expect(timelineOpeningMs(END, FIRST, Date.parse('2026-01-01T00:00:00Z'))).toBe(FIRST);
    expect(timelineOpeningMs(END, FIRST, Date.parse('2027-02-01T00:00:00Z'))).toBe(FIRST);
  });

  it('opens on the first stop when the timeline runs to now', () => {
    expect(timelineOpeningMs(undefined, FIRST, Date.parse('2026-11-26T12:00:00Z'))).toBe(FIRST);
  });
});

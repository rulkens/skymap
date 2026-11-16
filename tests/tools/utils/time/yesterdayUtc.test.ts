import { describe, expect, it } from 'vitest';

import { yesterdayUtc } from '../../../../tools/utils/time/yesterdayUtc';

describe('yesterdayUtc', () => {
  // Just after UTC midnight, local time in the Americas is still the previous evening.
  it('counts in UTC across a month end', () => {
    expect(yesterdayUtc(new Date('2026-03-01T00:30:00Z'))).toBe('2026-02-28');
  });
});

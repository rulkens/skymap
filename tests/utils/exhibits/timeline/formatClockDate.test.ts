import { describe, it, expect } from 'vitest';

import { formatClockDate } from '../../../../src/utils/exhibits/timeline/formatClockDate';
import { formatClockTime } from '../../../../src/utils/exhibits/timeline/formatClockTime';

describe('clock formats', () => {
  it('writes a UTC date and time of day', () => {
    const ms = Date.parse('1979-03-05T14:02:30Z');
    expect(formatClockDate(ms)).toBe('5 Mar 1979');
    expect(formatClockTime(ms)).toBe('14:02 UT');
  });
});

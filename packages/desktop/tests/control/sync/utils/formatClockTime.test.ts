import { describe, expect, it } from 'vitest';
import { formatClockTime } from '../../../../src/control/sync/utils/formatClockTime';

describe('formatClockTime', () => {
  it('is 24-hour local time with two-digit hour and minute', () => {
    expect(formatClockTime(new Date(2026, 10, 5, 7, 5).getTime())).toBe('07:05');
    expect(formatClockTime(new Date(2026, 10, 5, 15, 30).getTime())).toBe('15:30');
  });
});

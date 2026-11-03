import { describe, expect, it } from 'vitest';
import { simDaysToIsoDate } from '../../../src/utils/time/simDaysToIsoDate';

describe('simDaysToIsoDate', () => {
  it('reads the clock as Julian days, whose day starts at noon', () => {
    // J2000.0 is JD 2451545.0 = 2000-01-01 12:00 UTC; a modified JD (51544.5) would land in 1858.
    expect(simDaysToIsoDate(2_451_545)).toBe('2000-01-01');
    expect(simDaysToIsoDate(2_451_544.5)).toBe('2000-01-01');
    expect(simDaysToIsoDate(2_451_544.4)).toBe('1999-12-31');
  });
});

/**
 * unixMsToJulianDays converts a Unix epoch millisecond timestamp to a Julian
 * Day number.
 *
 * The anchor case is the J2000 epoch (2000-01-01T12:00:00Z), whose JD is exactly
 * 2_451_545.0. The Unix-ms literal is computed here independently of the
 * implementation's formula: 30 years (1970→2000) = 10_957 days
 * (30·365 + 7 leap days), plus half a day for the noon offset = 10_957.5 days;
 * ×86_400_000 ms/day = 946_728_000_000 ms.
 */

import { describe, it, expect } from 'vitest';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

describe('unixMsToJulianDays', () => {
  it('maps the J2000 epoch instant to JD 2451545.0', () => {
    expect(unixMsToJulianDays(946_728_000_000)).toBeCloseTo(2_451_545.0, 9);
  });

  it('maps the Unix epoch instant to JD 2440587.5', () => {
    // 1970-01-01T00:00:00Z = 0 ms ⇒ the epoch JD itself (noon offset = .5).
    expect(unixMsToJulianDays(0)).toBe(2_440_587.5);
  });
});

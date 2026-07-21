import { describe, it, expect } from 'vitest';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

describe('julianDaysToUnixMs', () => {
  it('is the exact inverse of unixMsToJulianDays for a whole-ms instant', () => {
    // Seed from a Unix-ms value so the JD lands on a clean instant; the pair
    // must round-trip without drift — this is the property the URL t= param
    // relies on to crystallize and restore the same moment.
    const unixMs = Date.UTC(2026, 10, 3, 18, 0, 0); // 2026-11-03T18:00:00Z
    const jd = unixMsToJulianDays(unixMs);
    expect(julianDaysToUnixMs(jd)).toBe(unixMs);
  });

  it('maps the Unix epoch JD back to 0 ms', () => {
    // 2_440_587.5 is the JD of 1970-01-01T00:00:00Z — the map's fixed point.
    expect(julianDaysToUnixMs(2_440_587.5)).toBe(0);
  });
});

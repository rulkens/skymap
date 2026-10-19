import { describe, it, expect } from 'vitest';
import { isoOfSimDays } from '../../../src/utils/time/isoOfSimDays';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

describe('isoOfSimDays', () => {
  it('round-trips a 2026 instant', () => {
    const iso = '2026-11-03T18:00:00.000Z';
    expect(isoOfSimDays(unixMsToJulianDays(Date.parse(iso)))).toBe(iso);
  });

  it('is null at year 3,000,000, past the Date range', () => {
    expect(isoOfSimDays(2_451_545 + 3_000_000 * 365.25)).toBeNull();
  });
});

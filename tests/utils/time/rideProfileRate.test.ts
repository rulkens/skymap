import { describe, it, expect } from 'vitest';

import { rideProfileRate } from '../../../src/utils/time/rideProfileRate';
import { formatRideRate } from '../../../src/utils/time/formatRideRate';
import type { RideProfile } from '../../../src/@types/time/RideProfile';

// Segment 0: 1 sim day in 1 s (86 400 s/s); segment 1: 1 sim day in 10 s (8 640 s/s).
const profile: RideProfile = {
  startWallMs: 1000,
  wallMs: Float64Array.of(0, 1000, 11_000),
  simDays: Float64Array.of(0, 1, 2),
};

describe('rideProfileRate', () => {
  it('is the slope of the segment containing now', () => {
    expect(rideProfileRate(profile, 1500)).toBeCloseTo(86_400);
    expect(rideProfileRate(profile, 3000)).toBeCloseTo(8_640);
  });
  it('is 0 before and after the table', () => {
    expect(rideProfileRate(profile, 500)).toBe(0);
    expect(rideProfileRate(profile, 20_000)).toBe(0);
  });
});

describe('formatRideRate', () => {
  it('picks the unit by magnitude', () => {
    expect(formatRideRate(240)).toBe('4 min/s');
    expect(formatRideRate(4320)).toBe('1.2 h/s');
    expect(formatRideRate(30)).toBe('30 s/s');
    expect(formatRideRate(86_400 * 2.5)).toBe('2.5 day/s');
  });
});

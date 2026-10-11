import { describe, it, expect } from 'vitest';

import { clockProfileRate } from '../../../src/utils/time/clockProfileRate';
import type { ClockProfile } from '../../../src/@types/time/ClockProfile';

// Segment 0: 1 sim day in 1 s (86 400 s/s); segment 1: 1 sim day in 10 s (8 640 s/s).
const profile: ClockProfile = {
  startWallMs: 1000,
  wallMs: Float64Array.of(0, 1000, 11_000),
  simDays: Float64Array.of(0, 1, 2),
};

describe('clockProfileRate', () => {
  it('is the slope of the segment containing now', () => {
    expect(clockProfileRate(profile, 1500)).toBeCloseTo(86_400);
    expect(clockProfileRate(profile, 3000)).toBeCloseTo(8_640);
  });
  it('is 0 before and after the table', () => {
    expect(clockProfileRate(profile, 500)).toBe(0);
    expect(clockProfileRate(profile, 20_000)).toBe(0);
  });
});

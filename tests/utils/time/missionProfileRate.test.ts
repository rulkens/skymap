import { describe, it, expect } from 'vitest';

import { missionProfileRate } from '../../../src/utils/time/missionProfileRate';
import { formatSimRate } from '../../../src/utils/time/formatSimRate';
import type { MissionProfile } from '../../../src/@types/time/MissionProfile';

// Segment 0: 1 sim day in 1 s (86 400 s/s); segment 1: 1 sim day in 10 s (8 640 s/s).
const profile: MissionProfile = {
  startWallMs: 1000,
  wallMs: Float64Array.of(0, 1000, 11_000),
  simDays: Float64Array.of(0, 1, 2),
  speedIndex: 2,
};

describe('missionProfileRate', () => {
  it('is the slope of the segment containing now', () => {
    expect(missionProfileRate(profile, 1500)).toBeCloseTo(86_400);
    expect(missionProfileRate(profile, 3000)).toBeCloseTo(8_640);
  });
  it('is 0 before and after the table', () => {
    expect(missionProfileRate(profile, 500)).toBe(0);
    expect(missionProfileRate(profile, 20_000)).toBe(0);
  });
});

describe('formatSimRate', () => {
  it('picks the unit by magnitude', () => {
    expect(formatSimRate(240)).toBe('4 min/s');
    expect(formatSimRate(4320)).toBe('1.2 h/s');
    expect(formatSimRate(30)).toBe('30 s/s');
    expect(formatSimRate(86_400 * 2.5)).toBe('2.5 day/s');
    expect(formatSimRate(86_400 * 365.25 * 1.4)).toBe('1.4 yr/s');
  });
});

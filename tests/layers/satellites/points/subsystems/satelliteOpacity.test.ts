import { describe, expect, it } from 'vitest';
import { satelliteOpacity } from '../../../../../src/layers/satellites/points/subsystems/satelliteOpacity';

const DAY = 86_400_000;
const T = Date.parse('2026-10-28T00:00:00Z');

describe('satelliteOpacity', () => {
  it('stays full at any time after the fetch: drifting positions are flagged on the card instead', () => {
    expect(satelliteOpacity(T, T)).toBe(1);
    expect(satelliteOpacity(T + 30 * DAY, T)).toBe(1);
    expect(satelliteOpacity(T + 3650 * DAY, T)).toBe(1);
  });

  it('fades out a fortnight before the fetch, where unlaunched objects would show', () => {
    expect(satelliteOpacity(T - 11 * DAY, T)).toBe(1);
    expect(satelliteOpacity(T - 13 * DAY, T)).toBeGreaterThan(0);
    expect(satelliteOpacity(T - 13 * DAY, T)).toBeLessThan(1);
    expect(satelliteOpacity(T - 14 * DAY, T)).toBe(0);
  });
});

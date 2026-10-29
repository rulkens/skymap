import { describe, expect, it } from 'vitest';
import { satelliteOpacity } from '../../../../src/layers/satellites/subsystems/satelliteOpacity';

const DAY = 86_400_000;
const T = Date.parse('2026-10-28T00:00:00Z');

describe('satelliteOpacity', () => {
  it('is full near Earth inside the data window, past and future alike', () => {
    expect(satelliteOpacity(T, T, 50_000)).toBe(1);
    expect(satelliteOpacity(T - 11 * DAY, T, 50_000)).toBe(1);
    expect(satelliteOpacity(T + 11 * DAY, T, 50_000)).toBe(1);
  });

  it('is gone a fortnight from the fetch: stale elements fade the Layer out on their own', () => {
    expect(satelliteOpacity(T + 13 * DAY, T, 50_000)).toBeGreaterThan(0);
    expect(satelliteOpacity(T + 13 * DAY, T, 50_000)).toBeLessThan(1);
    expect(satelliteOpacity(T + 14 * DAY, T, 50_000)).toBe(0);
    expect(satelliteOpacity(T - 30 * DAY, T, 50_000)).toBe(0);
  });

  it('fades with the camera’s distance from Earth', () => {
    expect(satelliteOpacity(T, T, 450_000)).toBeGreaterThan(0);
    expect(satelliteOpacity(T, T, 450_000)).toBeLessThan(1);
    expect(satelliteOpacity(T, T, 600_000)).toBe(0);
  });
});

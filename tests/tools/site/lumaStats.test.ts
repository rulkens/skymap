import { describe, expect, it } from 'vitest';

import { brightnessFlags } from '../../../tools/site/utils/brightnessFlags';
import { lumaStats } from '../../../tools/site/utils/lumaStats';

const pixels = (black: number, value: number, count: number) =>
  Uint8Array.from([...Array<number>(black).fill(0), ...Array<number>(count).fill(value)]);

describe('lumaStats', () => {
  it('reads a black field with a small lit subject by its 95th percentile, not its mean', () => {
    const stats = lumaStats(pixels(90, 204, 10));
    expect(stats.p5).toBe(0);
    expect(stats.p95).toBeCloseTo(0.8);
    expect(stats.mean).toBeCloseTo(0.08);
    expect(brightnessFlags(stats)).toEqual([]);
  });

  it('flags a picture whose brightest twentieth stays dim, and one clipped at white', () => {
    expect(brightnessFlags(lumaStats(pixels(90, 30, 10)))[0]).toMatch(/^TOO DARK.*exposure/);
    expect(brightnessFlags(lumaStats(pixels(90, 255, 10)))[0]).toMatch(/^BURNT/);
  });
});

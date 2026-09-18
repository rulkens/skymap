import { describe, expect, it } from 'vitest';

import { fitAtlasScale } from '../../../../tools/scene-recon/atlas/fitAtlasScale';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';

const STUB_PACKED: PackedAtlas = {
  sizePx: 2048,
  chartCount: 1,
  vertices: [],
  indices: new Uint32Array(),
};

describe('fitAtlasScale', () => {
  it('takes scale 1 when it fits', async () => {
    const calls: number[] = [];
    const result = await fitAtlasScale(2048, 6_300_000, async (scale) => {
      calls.push(scale);
      return STUB_PACKED;
    });

    expect(result.scale).toBe(1);
    expect(calls).toEqual([1]);
  });

  it('seeds from the used-texel estimate and steps down by 2%', async () => {
    const calls: number[] = [];
    const result = await fitAtlasScale(2048, 6_300_000, async (scale) => {
      calls.push(scale);
      return scale <= 0.44 ? STUB_PACKED : null;
    });

    expect(calls[0]).toBe(1);
    expect(calls[1]).toBeCloseTo(0.632, 3);
    // the winner is the first `0.632 × 0.98^k` at or below 0.44: k = 18
    expect(result.scale).toBeCloseTo(0.6320265214447285 * 0.98 ** 18, 12);
    expect(result.scale).toBeLessThanOrEqual(0.44);
    expect(result.scale / 0.98).toBeGreaterThan(0.44); // one step earlier must have failed
  });

  it('throws when nothing fits', async () => {
    await expect(fitAtlasScale(2048, 6_300_000, async () => null)).rejects.toThrow(/2048.*6300000/);
  });
});

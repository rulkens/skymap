import { describe, expect, it } from 'vitest';
import { encodeVolumeLevel } from '../../../../tools/volumes/utils/encodeVolumeLevel';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// encodeMax = e − 1 makes log1p(encodeMax) = 1, so a code is round(255 · log1p(v)).
const E_MINUS_1 = Math.E - 1;
const ONE: Vec3 = [1, 1, 1];
const WHOLE_VOXEL = { originVox: [0, 0, 0] as Vec3, dims: ONE };

function codeOf(v: number, zeroBelowRaw = 0): number {
  return encodeVolumeLevel(Float64Array.of(v), ONE, WHOLE_VOXEL, E_MINUS_1, zeroBelowRaw)[0]!;
}

describe('encodeVolumeLevel', () => {
  it('crops the box and reorders C-order to x fastest', () => {
    // Input i holds expm1(i / 255), so its code is exactly i and the output names its source.
    const values = Float32Array.from({ length: 12 }, (_, i) => Math.expm1(i / 255));
    const box = { originVox: [1, 0, 0] as Vec3, dims: [2, 2, 2] as Vec3 };

    const out = encodeVolumeLevel(values, [3, 2, 2], box, E_MINUS_1, 0);

    // out[x + 2·(y + 2·z)] = input[(x + 1)·4 + y·2 + z]
    expect([...out]).toEqual([4, 8, 6, 10, 5, 9, 7, 11]);
  });

  it("codes against encodeMax, not the level's own peak", () => {
    expect(codeOf(Math.exp(0.4) - 1)).toBe(102);
  });

  it('rounds to nearest', () => {
    // 255 · 0.2494 = 63.6: truncation would give 63.
    expect(codeOf(Math.exp(0.2494) - 1)).toBe(64);
  });

  it('zeroes raw values below the threshold, keeps the rest', () => {
    expect(codeOf(0.05, 0.1)).toBe(0); // would code 12
    expect(codeOf(Math.exp(0.2) - 1, 0.1)).toBe(51);
  });

  it('clamps above encodeMax to 255', () => {
    expect(codeOf(Math.exp(2) - 1)).toBe(255);
  });
});

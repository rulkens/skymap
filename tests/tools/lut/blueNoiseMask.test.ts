import { describe, it, expect } from 'vitest';
import { blueNoiseMask } from '../../../tools/lut/blueNoiseMask';
import { mulberry32 } from '../../../packages/shared/src/utils/random/mulberry32';

// Test scale, not the baked 64 × 64 × 16: the properties are about the ordering, not its size.
const SIZE = 16;
const SLICES = 4;
const MASK = blueNoiseMask(SIZE, SLICES, 7);

/** The same byte values in a seeded random order: the white-noise control. */
function whiteControl(values: Uint8Array): Uint8Array {
  const out = Uint8Array.from(values);
  const rand = mulberry32(99);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** DFT power of each slice over 0 < |k| ≤ 2, mean removed, summed over slices. */
function lowFrequencyPower(values: Uint8Array): number {
  let power = 0;
  for (let s = 0; s < SLICES; s += 1) {
    const slice = values.subarray(s * SIZE * SIZE, (s + 1) * SIZE * SIZE);
    const mean = slice.reduce((a, v) => a + v, 0) / slice.length;
    for (let ky = -2; ky <= 2; ky += 1) {
      for (let kx = -2; kx <= 2; kx += 1) {
        const k2 = kx * kx + ky * ky;
        if (k2 === 0 || k2 > 4) continue;
        let re = 0;
        let im = 0;
        for (let y = 0; y < SIZE; y += 1) {
          for (let x = 0; x < SIZE; x += 1) {
            const phase = (-2 * Math.PI * (kx * x + ky * y)) / SIZE;
            const v = slice[y * SIZE + x]! - mean;
            re += v * Math.cos(phase);
            im += v * Math.sin(phase);
          }
        }
        power += re * re + im * im;
      }
    }
  }
  return power;
}

/** Mean over pixels of how far the pixel's time-mean sits from the value range's centre. */
function temporalMeanError(values: Uint8Array): number {
  let total = 0;
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    let sum = 0;
    for (let s = 0; s < SLICES; s += 1) sum += values[s * SIZE * SIZE + p]!;
    total += Math.abs(sum / SLICES - 127.5);
  }
  return total / (SIZE * SIZE);
}

describe('blueNoiseMask', () => {
  it('every byte value occurs equally often', () => {
    const counts = new Array<number>(256).fill(0);
    for (const v of MASK) counts[v]! += 1;
    expect(counts.every((c) => c === (SIZE * SIZE * SLICES) / 256)).toBe(true);
  });

  it('the same seed gives the same bytes', () => {
    expect(blueNoiseMask(SIZE, SLICES, 7)).toEqual(MASK);
  });

  it('each slice is spatially blue', () => {
    expect(lowFrequencyPower(MASK)).toBeLessThanOrEqual(
      0.25 * lowFrequencyPower(whiteControl(MASK)),
    );
  });

  it("each pixel's values integrate fast over time", () => {
    expect(temporalMeanError(MASK)).toBeLessThanOrEqual(
      0.5 * temporalMeanError(whiteControl(MASK)),
    );
  });
});

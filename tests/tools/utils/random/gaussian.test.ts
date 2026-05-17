import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { gaussian } from '../../../../tools/utils/random/gaussian';

/**
 * `gaussian` should produce draws with mean ≈ 0 and stddev ≈ 1.  We
 * sample N draws from a fixed seed and check empirical moments within
 * a generous tolerance — Box-Muller is exact in the limit, but 10 000
 * samples isn't infinity.
 */
describe('gaussian', () => {
  it('produces samples with mean ≈ 0 and stddev ≈ 1', () => {
    const rng = mulberry32(42);
    const N = 10000;
    let sum = 0;
    const xs: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = gaussian(rng);
      xs.push(x);
      sum += x;
    }
    const mean = sum / N;
    let sqsum = 0;
    for (const x of xs) sqsum += (x - mean) * (x - mean);
    const stddev = Math.sqrt(sqsum / N);
    expect(mean).toBeCloseTo(0, 1); // within 0.05
    expect(stddev).toBeCloseTo(1, 1); // within 0.05
  });

  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(gaussian(a)).toBe(gaussian(b));
    }
  });
});

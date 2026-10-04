import { describe, it, expect } from 'vitest';
import { fft } from '../../../../tools/utils/math/fft';

describe('fft', () => {
  it("fft finds a pure sinusoid's bin", () => {
    const n = 64;
    const re = Float64Array.from({ length: n }, (_, i) =>
      Math.cos((2 * Math.PI * 5 * i) / n + 0.3),
    );
    const im = new Float64Array(n);
    fft(re, im);
    const power = Array.from({ length: n / 2 }, (_, k) => re[k]! ** 2 + im[k]! ** 2);
    expect(power.indexOf(Math.max(...power))).toBe(5);
    // A pure in-bin tone carries amplitude N/2 and leaks nowhere.
    expect(Math.sqrt(power[5]!)).toBeCloseTo(n / 2, 9);
    expect(Math.max(...power.filter((_, k) => k !== 5))).toBeLessThan(1e-18);
  });
});

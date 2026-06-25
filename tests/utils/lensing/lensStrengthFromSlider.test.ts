// tests/utils/lensing/lensStrengthFromSlider.test.ts
import { describe, it, expect } from 'vitest';
import { lensStrengthFromSlider } from '../../../src/utils/lensing/lensStrengthFromSlider';
import { lensSliderFromStrength } from '../../../src/utils/lensing/lensSliderFromStrength';

describe('lensStrengthFromSlider', () => {
  it('maps p = 0 to a hard-off strength of 0', () => {
    expect(lensStrengthFromSlider(0)).toBe(0);
  });

  it('clamps negative p to 0', () => {
    expect(lensStrengthFromSlider(-0.3)).toBe(0);
  });

  it('maps p = 1 to 1000× (LOG_MAX = 3)', () => {
    expect(lensStrengthFromSlider(1)).toBeCloseTo(1000, 3);
  });

  it('maps the low end p just above 0 toward 0.1× (LOG_MIN = -1)', () => {
    // The smallest non-zero slider value resolves near 10^-1.
    expect(lensStrengthFromSlider(1e-9)).toBeCloseTo(0.1, 6);
  });

  it('puts the physical 1.0× at p = 0.25 (log-midpoint of [-1, 3])', () => {
    // 10^(-1 + 0.25·4) = 10^0 = 1.
    expect(lensStrengthFromSlider(0.25)).toBeCloseTo(1.0, 6);
  });
});

describe('lensSliderFromStrength', () => {
  it('inverts lensStrengthFromSlider for in-range strengths', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 1]) {
      expect(lensSliderFromStrength(lensStrengthFromSlider(p))).toBeCloseTo(p, 6);
    }
  });

  it('maps strength 0 back to slider 0', () => {
    expect(lensSliderFromStrength(0)).toBe(0);
  });

  it('maps the physical 1.0× back to p = 0.25', () => {
    expect(lensSliderFromStrength(1)).toBeCloseTo(0.25, 6);
  });

  it('clamps an above-range strength to slider 1', () => {
    expect(lensSliderFromStrength(1e6)).toBe(1);
  });
});

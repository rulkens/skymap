import { describe, it, expect } from 'vitest';
import { subtitleOpacity } from '../../../src/utils/animation/subtitleOpacity';
import { SUBTITLE_FADE_SEC } from '../../../src/data/animation/subtitleTiming';

const slice = { startSec: 4, endSec: 10 };

describe('subtitleOpacity', () => {
  it('is 0 before the slice and after it', () => {
    expect(subtitleOpacity(slice, 3.9, false)).toBe(0);
    expect(subtitleOpacity(slice, 10, false)).toBe(0);
  });

  it('is 1 mid-slice', () => {
    expect(subtitleOpacity(slice, 7, false)).toBe(1);
  });

  it('ramps through 0.5 halfway through each fade', () => {
    expect(subtitleOpacity(slice, 4 + SUBTITLE_FADE_SEC / 2, false)).toBeCloseTo(0.5);
    expect(subtitleOpacity(slice, 10 - SUBTITLE_FADE_SEC / 2, false)).toBeCloseTo(0.5);
  });

  it('stepped has no ramp', () => {
    expect(subtitleOpacity(slice, 4 + 0.01, true)).toBe(1);
    expect(subtitleOpacity(slice, 10 - 0.01, true)).toBe(1);
    expect(subtitleOpacity(slice, 3.99, true)).toBe(0);
  });
});

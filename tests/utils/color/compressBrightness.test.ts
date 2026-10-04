import { describe, expect, it } from 'vitest';
import { compressBrightness } from '../../../src/utils/color/compressBrightness';

describe('compressBrightness', () => {
  it('raises the largest channel to max^gamma and keeps the channel ratios', () => {
    const [r, g, b] = compressBrightness([0.08, 0.16, 0.04], 0.5);
    expect(g).toBeCloseTo(0.4, 10);
    expect(r / g).toBeCloseTo(0.5, 10);
    expect(b / g).toBeCloseTo(0.25, 10);
  });

  it('passes black through rather than dividing by zero', () => {
    expect(compressBrightness([0, 0, 0], 0.45)).toEqual([0, 0, 0]);
  });
});

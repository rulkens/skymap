import { describe, expect, it } from 'vitest';
import { rectMeetsCircle } from '../../../src/utils/math/rectMeetsCircle';

describe('rectMeetsCircle', () => {
  const circle = [0, 0] as const;
  it('meets a rect across the edge, and one holding the whole circle', () => {
    expect(rectMeetsCircle({ x0: 9, y0: -1, x1: 20, y1: 1 }, circle, 10)).toBe(true);
    expect(rectMeetsCircle({ x0: -50, y0: -50, x1: 50, y1: 50 }, circle, 10)).toBe(true);
  });
  it('misses a rect whose corner, not side, faces the circle', () => {
    // The bounding square would meet it; the corner sits at 8.5·√2 ≈ 12 px.
    expect(rectMeetsCircle({ x0: 8.5, y0: 8.5, x1: 20, y1: 20 }, circle, 10)).toBe(false);
  });
});

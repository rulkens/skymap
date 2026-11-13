import { describe, expect, it } from 'vitest';
import { rectMeetsPolygon } from '../../../src/utils/math/rectMeetsPolygon';
import type { Vec2 } from '../../../src/@types/math/Vec2';

// A ring seen tilted, its near half swollen by perspective: a lopsided ellipse outline.
const RING: Vec2[] = Array.from({ length: 32 }, (_, k) => {
  const t = (k / 32) * 2 * Math.PI;
  return [300 * Math.cos(t), Math.sin(t) > 0 ? 120 * Math.sin(t) : 40 * Math.sin(t)];
});
const box = (x: number, y: number) => ({ x0: x, y0: y, x1: x + 40, y1: y + 10 });

describe('rectMeetsPolygon', () => {
  it('meets a rect on the swollen near half and misses one as far out on the narrow side', () => {
    expect(rectMeetsPolygon(box(0, 90), RING)).toBe(true);
    expect(rectMeetsPolygon(box(0, -90), RING)).toBe(false);
  });

  it('meets a rect inside it, one around it, and one crossing an edge with no vertex inside', () => {
    expect(rectMeetsPolygon(box(-20, -5), RING)).toBe(true);
    expect(rectMeetsPolygon({ x0: -400, y0: -200, x1: 400, y1: 200 }, RING)).toBe(true);
    expect(rectMeetsPolygon({ x0: -500, y0: -1, x1: 500, y1: 1 }, RING)).toBe(true);
  });
});

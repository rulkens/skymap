import { describe, expect, it } from 'vitest';

import { shelfPack } from '../../../../tools/utils/image/shelfPack';

describe('shelfPack', () => {
  it('keeps every rect inside the atlas, a gutter clear of the edge and of each other', () => {
    const sizes = [
      { w: 60, h: 20 },
      { w: 30, h: 50 },
      { w: 45, h: 45 },
      { w: 10, h: 10 },
      { w: 70, h: 5 },
      { w: 25, h: 33 },
    ];
    const g = 4;
    const { width, height, rects } = shelfPack(sizes, 100, g);
    expect(width).toBeLessThanOrEqual(100);
    rects.forEach((r, i) => {
      expect([r.w, r.h]).toEqual([sizes[i]!.w, sizes[i]!.h]);
      expect(r.x).toBeGreaterThanOrEqual(g);
      expect(r.y).toBeGreaterThanOrEqual(g);
      expect(r.x + r.w + g).toBeLessThanOrEqual(width);
      expect(r.y + r.h + g).toBeLessThanOrEqual(height);
      for (const o of rects.slice(i + 1)) {
        const apart =
          r.x + r.w + g <= o.x ||
          o.x + o.w + g <= r.x ||
          r.y + r.h + g <= o.y ||
          o.y + o.h + g <= r.y;
        expect(apart).toBe(true);
      }
    });
  });
});

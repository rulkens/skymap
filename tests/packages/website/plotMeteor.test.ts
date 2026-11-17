import { describe, expect, it } from 'vitest';

import { plotMeteor } from '../../../packages/website/src/utils/plotMeteor';

const box = { width: 1000, height: 600 } as DOMRect;
const sky = { left: 0.1, top: 0.1, right: 0.5, bottom: 0.4 };

function inSky(x: number, y: number): boolean {
  const eps = 1e-6;
  return (
    x >= sky.left * box.width - eps &&
    x <= sky.right * box.width + eps &&
    y >= sky.top * box.height - eps &&
    y <= sky.bottom * box.height + eps
  );
}

describe('plotMeteor', () => {
  it('lays the whole path, start and end of the head, inside the sky', () => {
    for (let i = 0; i < 500; i++) {
      const streak = plotMeteor(sky, box, i, 0);
      if (!streak) continue;
      const style = streak.style as Record<string, string | number>;
      const x = Number(style.left) + Number(style.width);
      const y = Number(style.top);
      const angle = parseFloat(String(style['--angle']));
      const travel = parseFloat(String(style['--travel']));
      expect(inSky(x, y)).toBe(true);
      expect(inSky(x + travel * Math.cos(angle), y + travel * Math.sin(angle))).toBe(true);
    }
  });

  it('gives up on a sky too small for any path', () => {
    expect(plotMeteor({ left: 0.5, top: 0.5, right: 0.501, bottom: 0.501 }, box, 1, 0)).toBeNull();
  });
});

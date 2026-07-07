import { describe, it, expect } from 'vitest';
import { measureLabel } from '../../../../src/services/gpu/labels/measureLabel';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';

// Same two-glyph fixture as labelLayout.test.ts: A is 30×40 at xoffset 1 /
// yoffset 2 advancing 25, B is 28×40 at xoffset 0 / yoffset 2 advancing 26,
// with an A→B kern of −1 and a 50 px lineHeight.
const FIXTURE = {
  pages: ['atlas.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 1,
      yoffset: 2,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
    {
      id: 66,
      x: 32,
      y: 0,
      width: 28,
      height: 40,
      xoffset: 0,
      yoffset: 2,
      xadvance: 26,
      page: 0,
      chnl: 15,
    },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('measureLabel', () => {
  const metrics = parseFontMetrics(FIXTURE);

  it('folds the laid-out quads into an ink bbox (baseline / left)', () => {
    // A spans x∈[1,31]; B starts at pen 25−1 (kern) with xoffset 0,
    // spanning x∈[24,52].  Both span y∈[2,42].
    expect(measureLabel('AB', metrics)).toEqual({ minX: 1, minY: 2, maxX: 52, maxY: 42 });
  });

  it('reflects the alignment shifts (center / center)', () => {
    // Line advance width = 25 − 1 + 26 = 50 → alignX shift 25.
    // Ink bbox y∈[2,42] → alignY shift 22.
    expect(measureLabel('AB', metrics, 'center', 'center')).toEqual({
      minX: -24,
      minY: -20,
      maxX: 27,
      maxY: 20,
    });
  });

  it('spans both lines of a multi-line label', () => {
    // Second line drops by lineHeight 50: B spans y∈[52,92].
    expect(measureLabel('A\nB', metrics)).toEqual({ minX: 0, minY: 2, maxX: 31, maxY: 92 });
  });

  it('returns null when nothing lays out', () => {
    expect(measureLabel('', metrics)).toBeNull();
    expect(measureLabel('中', metrics)).toBeNull(); // glyph absent from atlas
  });
});

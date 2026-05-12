import { describe, it, expect } from 'vitest';
import { layoutLabel } from '../../../../src/services/gpu/labels/labelLayout';
import type { GlyphQuad } from '../../../../src/@types/rendering/GlyphQuad';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';

const FIXTURE = {
  pages: ['atlas.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0,  y: 0, width: 30, height: 40, xoffset: 1, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
    { id: 66, x: 32, y: 0, width: 28, height: 40, xoffset: 0, yoffset: 2, xadvance: 26, page: 0, chnl: 15 },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('layoutLabel', () => {
  const metrics = parseFontMetrics(FIXTURE);

  it('produces one quad per glyph', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads).toHaveLength(2);
  });

  it('positions glyphs sequentially with kerning', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads[0]!.localOffsetX).toBeCloseTo(1);                    // A xoffset
    expect(quads[1]!.localOffsetX).toBeCloseTo(25 + (-1) + 0);        // A.advance + kerning + B.xoffset
  });

  it('skips glyphs not in the atlas', () => {
    const quads = layoutLabel('A中B', metrics);
    expect(quads).toHaveLength(2); // 中 dropped silently
  });

  it('returns total advance width', () => {
    const quads = layoutLabel('AB', metrics);
    const last = quads[quads.length - 1]!;
    // Width spans from start through last glyph's right edge.
    expect(last.localOffsetX + last.localSizeW).toBeGreaterThan(48);
  });

  it('emits glyph atlas UV from metrics', () => {
    const quads = layoutLabel('A', metrics);
    expect(quads[0]!.uvU0).toBeCloseTo(0);
    expect(quads[0]!.uvV0).toBeCloseTo(0);
    expect(quads[0]!.uvU1).toBeCloseTo(30 / 1024);
  });
});

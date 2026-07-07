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

describe('layoutLabel', () => {
  const metrics = parseFontMetrics(FIXTURE);

  it('produces one quad per glyph', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads).toHaveLength(2);
  });

  it('positions glyphs sequentially with kerning', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads[0]!.localOffsetX).toBeCloseTo(1); // A xoffset
    expect(quads[1]!.localOffsetX).toBeCloseTo(25 + -1 + 0); // A.advance + kerning + B.xoffset
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

  it('breaks on \\n: second line restarts the pen and drops by lineHeight', () => {
    const quads = layoutLabel('A\nB', metrics);
    expect(quads).toHaveLength(2);
    // Line 0: A at its own xoffset. Line 1: B restarts at pen 0 (no carried
    // advance, no A→B kerning across the break) and sits one lineHeight lower.
    expect(quads[0]!.localOffsetX).toBeCloseTo(1); // A xoffset
    expect(quads[0]!.localOffsetY).toBeCloseTo(2); // A yoffset, line 0
    expect(quads[1]!.localOffsetX).toBeCloseTo(0); // B xoffset, fresh pen
    expect(quads[1]!.localOffsetY).toBeCloseTo(2 + 50); // B yoffset + lineHeight
  });

  it('centers each line independently under alignX center', () => {
    // 'AB\nA': line 0 is wider (A.advance + kern + B ink) than line 1 (A ink).
    // Per-line centering shifts each line by half ITS OWN width, so the two
    // lines share a centre, not a left edge.
    const quads = layoutLabel('AB\nA', metrics, 'center');
    expect(quads).toHaveLength(3);
    const line0Width = 25 - 1 + 26; // A.advance + kerning + B.advance
    const line1Width = 25; // A.advance
    expect(quads[0]!.localOffsetX).toBeCloseTo(1 - line0Width / 2);
    expect(quads[2]!.localOffsetX).toBeCloseTo(1 - line1Width / 2);
  });
});

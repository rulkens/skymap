import { describe, it, expect } from 'vitest';
import { parseFontMetrics, lookupGlyph, type FontMetrics } from '../../../src/services/gpu/fontMetrics';

const FIXTURE = {
  pages: ['jetbrains-mono.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'JetBrains Mono', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 1, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
    { id: 66, x: 32, y: 0, width: 28, height: 40, xoffset: 0, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('parseFontMetrics', () => {
  it('parses atlas dimensions and distance range', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.atlas.width).toBe(1024);
    expect(m.atlas.height).toBe(1024);
    expect(m.atlas.distanceRange).toBe(4);
    expect(m.lineHeight).toBe(50);
    expect(m.fontSize).toBe(42);
  });

  it('indexes glyphs by codepoint', () => {
    const m = parseFontMetrics(FIXTURE);
    const a = lookupGlyph(m, 'A'.codePointAt(0)!);
    expect(a).toBeDefined();
    expect(a!.advance).toBe(25);
    expect(a!.uv.u0).toBeCloseTo(0 / 1024);
    expect(a!.uv.v0).toBeCloseTo(0 / 1024);
    expect(a!.uv.u1).toBeCloseTo(30 / 1024);
    expect(a!.uv.v1).toBeCloseTo(40 / 1024);
  });

  it('returns undefined for unknown codepoints', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(lookupGlyph(m, 0x4e2d)).toBeUndefined(); // 中 — not in atlas
  });

  it('exposes kerning pairs', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.kerning.get('65,66')).toBe(-1);
  });
});

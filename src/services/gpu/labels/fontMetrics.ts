/**
 * fontMetrics — parses the BMFont JSON emitted by `tools/buildFontAtlas.ts`
 * into a runtime-friendly shape with O(1) glyph lookup by codepoint.
 *
 * BMFont JSON has a flat `chars` array indexed by id (codepoint); we
 * convert to a Map for fast lookup and pre-divide pixel positions by
 * atlas size so the renderer never has to do that math at draw time.
 *
 * Why a separate module instead of putting it in labelRenderer?  Pure
 * data transformation, easy to unit-test against fixtures, and the
 * label-layout helper (next task) depends on it without dragging in any
 * GPU code.
 */

export type GlyphMetrics = {
  /** UV rect in [0,1] atlas space. */
  uv: { u0: number; v0: number; u1: number; v1: number };
  /** Glyph plane size in pixels at the atlas's source font size. */
  size: { w: number; h: number };
  /** Pen offset to the glyph quad's top-left, in pixels. */
  offset: { x: number; y: number };
  /** Pen advance after this glyph, in pixels. */
  advance: number;
};

export type FontMetrics = {
  atlas: { width: number; height: number; distanceRange: number };
  fontSize: number;
  lineHeight: number;
  glyphs: Map<number, GlyphMetrics>;
  /** Key is `"${first},${second}"` (codepoints). Value is amount in pixels. */
  kerning: Map<string, number>;
};

export type RawBMFont = {
  pages: string[];
  common: { lineHeight: number; base: number; scaleW: number; scaleH: number };
  info: { face: string; size: number };
  /** Top-level (NOT inside `info`) per msdf-bmfont-xml's JSON output. */
  distanceField: { fieldType: string; distanceRange: number };
  chars: Array<{
    id: number; x: number; y: number; width: number; height: number;
    xoffset: number; yoffset: number; xadvance: number;
    page: number; chnl: number;
  }>;
  kernings?: Array<{ first: number; second: number; amount: number }>;
};

export function parseFontMetrics(raw: RawBMFont): FontMetrics {
  const w = raw.common.scaleW;
  const h = raw.common.scaleH;
  const glyphs = new Map<number, GlyphMetrics>();
  for (const c of raw.chars) {
    glyphs.set(c.id, {
      uv: {
        u0: c.x / w,
        v0: c.y / h,
        u1: (c.x + c.width) / w,
        v1: (c.y + c.height) / h,
      },
      size: { w: c.width, h: c.height },
      offset: { x: c.xoffset, y: c.yoffset },
      advance: c.xadvance,
    });
  }
  const kerning = new Map<string, number>();
  for (const k of raw.kernings ?? []) {
    kerning.set(`${k.first},${k.second}`, k.amount);
  }
  return {
    atlas: { width: w, height: h, distanceRange: raw.distanceField.distanceRange },
    fontSize: raw.info.size,
    lineHeight: raw.common.lineHeight,
    glyphs,
    kerning,
  };
}

export function lookupGlyph(m: FontMetrics, codepoint: number): GlyphMetrics | undefined {
  return m.glyphs.get(codepoint);
}

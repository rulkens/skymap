/**
 * GlyphMetrics — per-codepoint atlas placement data emitted by
 * `parseFontMetrics`.  See `fontMetrics.ts` for the BMFont JSON parsing
 * pipeline that produces this shape.
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

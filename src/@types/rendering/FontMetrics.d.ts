/**
 * FontMetrics — runtime-friendly shape of the parsed BMFont atlas.
 * Includes an O(1) glyph lookup map by codepoint and a kerning lookup
 * keyed `"${first},${second}"`.  See `fontMetrics.ts` for the BMFont
 * JSON parsing pipeline that produces this shape.
 */

import type { GlyphMetrics } from './GlyphMetrics';

export type FontMetrics = {
  atlas: { width: number; height: number; distanceRange: number };
  fontSize: number;
  lineHeight: number;
  glyphs: Map<number, GlyphMetrics>;
  /** Key is `"${first},${second}"` (codepoints). Value is amount in pixels. */
  kerning: Map<string, number>;
};

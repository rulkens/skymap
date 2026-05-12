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

import type { GlyphMetrics } from '../../../@types/rendering/GlyphMetrics';
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import type { RawBMFont } from '../../../@types/rendering/RawBMFont';

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

/**
 * packAntiqueGlyphs — this frame's border digits into `AntiqueLettering`
 * (`fragment.wesl`): a u32 count, then per glyph centre, half extent (device
 * px) and its glyph-sheet rect.
 */

import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import { ANTIQUE_GLYPH_BYTES, ANTIQUE_MAX_GLYPHS } from '../../../data/rendering/antiqueLook';

export function packAntiqueGlyphs(
  glyphs: readonly AntiqueGlyphInstance[],
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_GLYPH_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  const count = Math.min(glyphs.length, ANTIQUE_MAX_GLYPHS);
  new Uint32Array(out)[0] = count;
  for (let i = 0; i < count; i++) {
    const g = glyphs[i]!;
    f32.set([...g.centrePx, ...g.halfPx, ...g.rect], 4 + i * 8);
  }
  return out;
}

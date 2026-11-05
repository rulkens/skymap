/**
 * measureLabel — the ink bounding box of already laid-out glyph quads,
 * anchor-relative in atlas pixels.
 *
 * Folding the quads (not re-walking the text) keeps the measurement identical
 * to what the shader draws. Null when there are no quads: no ink, nothing to
 * collide with.
 */
import type { GlyphQuad } from '../../../@types/rendering/GlyphQuad';
import type { LabelBBox } from '../../../@types/rendering/LabelBBox';

export function measureLabel(quads: readonly GlyphQuad[]): LabelBBox | null {
  if (quads.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of quads) {
    if (q.localOffsetX < minX) minX = q.localOffsetX;
    if (q.localOffsetY < minY) minY = q.localOffsetY;
    const right = q.localOffsetX + q.localSizeW;
    const bottom = q.localOffsetY + q.localSizeH;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return { minX, minY, maxX, maxY };
}

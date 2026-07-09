/**
 * measureLabel — the ink bounding box a label's text will occupy,
 * anchor-relative in atlas pixels.
 *
 * Folds over `layoutLabel`'s glyph quads rather than re-implementing the
 * pen walk: layout is the single source of truth for advances, kerning,
 * line breaks, and the alignX/alignY shifts, so the measurement can
 * never drift from what the shader actually draws.  The extra quad
 * array allocation is irrelevant at label-set sizes (~50 labels of
 * ~20 glyphs), and callers that measure per frame memoize by
 * (font, text, align) anyway — see `LabelRenderer.measure`.
 *
 * Returns null when the text lays out to zero quads (empty string,
 * whitespace-only, or every glyph missing from the atlas): there is no
 * ink, so there is nothing to collide with.
 */
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import type { LabelAlignX } from '../../../@types/rendering/LabelAlignX';
import type { LabelAlignY } from '../../../@types/rendering/LabelAlignY';
import type { LabelBBox } from '../../../@types/rendering/LabelBBox';
import { layoutLabel } from './labelLayout';

export function measureLabel(
  text: string,
  metrics: FontMetrics,
  alignX: LabelAlignX = 'left',
  alignY: LabelAlignY = 'baseline',
): LabelBBox | null {
  const quads = layoutLabel(text, metrics, alignX, alignY);
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

/**
 * textLayoutOf — memoised glyph layout + ink bbox per label text.
 *
 * Layout depends only on (font, alignment, text), but packing and declutter ask
 * for it every frame, so the answer is cached. The cache hangs off the metrics
 * record: it dies with the atlases, and the same inputs always give the same
 * output, so callers need no handle.
 */
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import type { Label2D } from '../../../@types/rendering/Label2D';
import type { LaidOutText } from '../../../@types/rendering/LaidOutText';
import { layoutLabel } from './labelLayout';
import { measureLabel } from './measureLabel';

// Unbounded by design: the key space is the label catalog (~hundreds), not user input.
const memoByMetrics = new WeakMap<LoadedFontAtlases['metricsByFont'], Map<string, LaidOutText>>();

export function textLayoutOf(
  metricsByFont: LoadedFontAtlases['metricsByFont'],
  label: Pick<Label2D, 'text' | 'font' | 'alignX' | 'alignY'>,
): LaidOutText {
  let memo = memoByMetrics.get(metricsByFont);
  if (memo === undefined) {
    memo = new Map();
    memoByMetrics.set(metricsByFont, memo);
  }
  const alignX = label.alignX ?? 'left';
  const alignY = label.alignY ?? 'baseline';
  const key = `${label.font}|${alignX}|${alignY}|${label.text}`;
  let laidOut = memo.get(key);
  if (laidOut === undefined) {
    const quads = layoutLabel(label.text, metricsByFont[label.font], alignX, alignY);
    laidOut = { quads, bbox: measureLabel(quads) };
    memo.set(key, laidOut);
  }
  return laidOut;
}

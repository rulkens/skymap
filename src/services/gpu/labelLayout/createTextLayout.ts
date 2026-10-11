/**
 * createTextLayout — memoized glyph layout + ink bbox per label text.
 *
 * Layout depends only on (font, alignment, text), all stable for a given label
 * id, so the memo converges to one entry per distinct label and the per-frame
 * cost (packing every label, declutter measuring every candidate) is a Map hit.
 */
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import type { GlyphQuad } from '../../../@types/rendering/GlyphQuad';
import type { LabelBBox } from '../../../@types/rendering/LabelBBox';
import type { TextLayout } from '../../../@types/rendering/TextLayout';
import type { TextLayoutInput } from '../../../@types/rendering/TextLayoutInput';
import { layoutLabel } from './labelLayout';
import { measureLabel } from './measureLabel';

export function createTextLayout(metricsByFont: LoadedFontAtlases['metricsByFont']): TextLayout {
  // Unbounded by design: the key space is the label catalog (~hundreds), not user input.
  const quadsMemo = new Map<string, readonly GlyphQuad[]>();
  const bboxMemo = new Map<string, LabelBBox | null>();

  // Fills both memos on a miss and returns the key they share.
  function keyOf(label: TextLayoutInput): string {
    const alignX = label.alignX ?? 'left';
    const alignY = label.alignY ?? 'baseline';
    const key = `${label.font}|${alignX}|${alignY}|${label.text}`;
    if (!quadsMemo.has(key)) {
      const metrics = metricsByFont[label.font];
      quadsMemo.set(key, layoutLabel(label.text, metrics, alignX, alignY));
      bboxMemo.set(key, measureLabel(label.text, metrics, alignX, alignY));
    }
    return key;
  }

  return {
    layout: (label) => quadsMemo.get(keyOf(label))!,
    measure: (label) => bboxMemo.get(keyOf(label))!,
  };
}

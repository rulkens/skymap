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

type Entry = { readonly quads: readonly GlyphQuad[]; readonly bbox: LabelBBox | null };

export function createTextLayout(metricsByFont: LoadedFontAtlases['metricsByFont']): TextLayout {
  // Unbounded by design: the key space is the label catalog (~hundreds), not user input.
  const memo = new Map<string, Entry>();

  function entryOf(label: TextLayoutInput): Entry {
    const alignX = label.alignX ?? 'left';
    const alignY = label.alignY ?? 'baseline';
    const key = `${label.font}|${alignX}|${alignY}|${label.text}`;
    let entry = memo.get(key);
    if (entry === undefined) {
      const metrics = metricsByFont[label.font];
      entry = {
        quads: layoutLabel(label.text, metrics, alignX, alignY),
        bbox: measureLabel(label.text, metrics, alignX, alignY),
      };
      memo.set(key, entry);
    }
    return entry;
  }

  return {
    layout: (label) => entryOf(label).quads,
    measure: (label) => entryOf(label).bbox,
  };
}

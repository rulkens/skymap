import type { GlyphQuad } from './GlyphQuad';
import type { LabelBBox } from './LabelBBox';
import type { TextLayoutInput } from './TextLayoutInput';

/** Memoized font-metrics maths for 2D labels; pure CPU, shared by the renderer and every measuring caller. */
export type TextLayout = {
  /** Glyph quads for the label's text; the returned array is shared and read-only. */
  layout(label: TextLayoutInput): readonly GlyphQuad[];
  /** Ink bounding box in atlas px relative to the anchor; null when the text lays out to no glyphs. */
  measure(label: TextLayoutInput): LabelBBox | null;
};

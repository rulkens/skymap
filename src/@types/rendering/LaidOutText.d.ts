import type { GlyphQuad } from './GlyphQuad';
import type { LabelBBox } from './LabelBBox';

export type LaidOutText = {
  /** Glyph quads; shared between callers, read-only. */
  readonly quads: readonly GlyphQuad[];
  /** Ink bounding box in atlas px relative to the anchor; null when the text lays out to no glyphs. */
  readonly bbox: LabelBBox | null;
};

import type { FontId } from '../data/FontId';
import type { Label2D } from './Label2D';
import type { LoadedFontAtlases } from './LoadedFontAtlases';

export type PackLabelsArgs = {
  readonly labels: readonly Label2D[];
  readonly metricsByFont: LoadedFontAtlases['metricsByFont'];
  /** FontId to texture-array layer, resolved once per label. */
  readonly layerIndexOf: Readonly<Record<FontId, number>>;
  /** Per-label storage records; must hold `labels.length * LABEL_DATA_BYTES`. */
  readonly labelF32: Float32Array;
  /** f32 and u32 views of ONE glyph-instance buffer. */
  readonly glyphF32: Float32Array;
  readonly glyphU32: Uint32Array;
  readonly maxGlyphs: number;
};

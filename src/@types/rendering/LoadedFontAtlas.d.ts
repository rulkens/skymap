/**
 * LoadedFontAtlas — the parsed-and-decoded result of `loadFontAtlas`.
 * Both halves are needed at GPU init: `metrics` drives per-glyph layout
 * in `setLabels`, and `bitmap` is uploaded as the MSDF atlas texture in
 * `createLabelRenderer`.
 */

import type { FontMetrics } from './FontMetrics';

export type LoadedFontAtlas = {
  metrics: FontMetrics;
  bitmap: ImageBitmap;
};

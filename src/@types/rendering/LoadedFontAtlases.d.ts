/**
 * LoadedFontAtlases — the parsed-and-decoded result of `loadFontAtlases`.
 *
 * Each registered font in `src/data/fonts.ts` contributes one
 * `FontMetrics` (parsed BMFont JSON, indexed by codepoint for O(1)
 * glyph lookup) and one `ImageBitmap` (the decoded PNG, ready for
 * `device.queue.copyExternalImageToTexture`).  The bitmaps are
 * ordered to match `FONT_IDS` so the renderer can upload
 * `bitmaps[i]` to layer `i` of its `texture_2d_array` atlas without
 * a name lookup per layer.
 *
 * ## Why a Record<FontId, FontMetrics> instead of two parallel arrays?
 *
 * Metrics are looked up by font id at label-pack time
 * (`metricsByFont[label.font]`); the Record gives O(1) keyed lookup.
 * Bitmaps are looked up by layer index at GPU-upload time
 * (`bitmaps[layerIndex]`); the readonly array gives positional
 * access matching the GPU layout.  Different access patterns →
 * different shapes.
 */

import type { FontMetrics } from './FontMetrics';
import type { FontId } from '../../data/fonts';

export type LoadedFontAtlases = {
  readonly metricsByFont: Readonly<Record<FontId, FontMetrics>>;
  /** Order matches `FONT_IDS`; index = GPU texture-array layer. */
  readonly bitmaps: readonly ImageBitmap[];
};

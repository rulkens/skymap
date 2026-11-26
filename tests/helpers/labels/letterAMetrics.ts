/**
 * Font metrics for every font id holding one glyph, an uppercase A 30 × 40 atlas px with a
 * 25 px advance, so a label's glyph count is its count of A's.
 */

import type { LoadedFontAtlases } from '../../../src/@types/rendering/LoadedFontAtlases';
import { parseFontMetrics } from '../../../src/services/gpu/labelLayout/fontMetrics';
import { FONT_IDS } from '../../../src/data/fonts';

const metrics = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 0,
      yoffset: 0,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
  ],
});

export const LETTER_A_METRICS = Object.fromEntries(
  FONT_IDS.map((id) => [id, metrics]),
) as LoadedFontAtlases['metricsByFont'];

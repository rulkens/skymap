/**
 * setAntiqueDigits — appends one number's glyph instances to `out`, centred on
 * a point and `ANTIQUE_NUMERAL_UNITS` tall, each digit at its own sheet width.
 */

import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import { ANTIQUE_NUMERAL_UNITS } from '../../../data/rendering/antiqueLook';

export function setAntiqueDigits(
  text: string,
  centre: readonly [number, number],
  unitPx: number,
  sheet: Pick<AntiqueGlyphSheet, 'width' | 'height' | 'glyphs'>,
  out: AntiqueGlyphInstance[],
): void {
  const height = ANTIQUE_NUMERAL_UNITS * unitPx;
  const rects = [...text].map((ch) => sheet.glyphs[ch]).filter((r) => r !== undefined);
  const scale = height / Math.max(...rects.map((r) => r.h));
  const total = rects.reduce((sum, r) => sum + r.w * scale, 0);
  let x = centre[0] - total / 2;
  for (const r of rects) {
    const w = r.w * scale;
    out.push({
      centrePx: [x + w / 2, centre[1]],
      halfPx: [w / 2, (r.h * scale) / 2],
      rect: [
        r.x / sheet.width,
        r.y / sheet.height,
        (r.x + r.w) / sheet.width,
        (r.y + r.h) / sheet.height,
      ],
    });
    x += w;
  }
}

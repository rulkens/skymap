/**
 * setAntiqueDigits — appends one number's glyph instances to `out`, centred on
 * a point and `ANTIQUE_NUMERAL_UNITS` tall, each glyph at its own sheet width.
 * Minutes (what follows a "°", or a whole number ending in "’") are set at
 * ANTIQUE_MINUTE_SCALE on the degrees' baseline.
 */

import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import { ANTIQUE_NUMERAL_UNITS } from '../../../data/rendering/antiqueLook';
import { ANTIQUE_MINUTE_SCALE } from '../../../data/rendering/antiqueRulings';

export function setAntiqueDigits(
  text: string,
  centre: readonly [number, number],
  unitPx: number,
  sheet: Pick<AntiqueGlyphSheet, 'width' | 'height' | 'baseline' | 'glyphs'>,
  out: AntiqueGlyphInstance[],
): void {
  const height = ANTIQUE_NUMERAL_UNITS * unitPx;
  const minutesFrom = text.endsWith('’') ? text.indexOf('°') + 1 : text.length;
  const glyphs = [...text].flatMap((ch, i) => {
    const r = sheet.glyphs[ch];
    return r === undefined ? [] : [{ r, size: i >= minutesFrom ? ANTIQUE_MINUTE_SCALE : 1 }];
  });
  const scale = height / Math.max(...glyphs.map(({ r }) => r.h));
  const total = glyphs.reduce((sum, { r, size }) => sum + r.w * scale * size, 0);
  let x = centre[0] - total / 2;
  for (const { r, size } of glyphs) {
    const w = r.w * scale * size;
    const h = r.h * scale * size;
    out.push({
      // Shrunk about the baseline, so a smaller glyph keeps the line.
      centrePx: [x + w / 2, centre[1] + (sheet.baseline - 0.5) * (r.h * scale - h)],
      halfPx: [w / 2, h / 2],
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

/**
 * placeAntiqueNumerals — the top border must read right ascension across both
 * seams: RA 0, where the label wraps 360 → 0, and RA 180, where `atan2` jumps
 * and the samples have to be unwrapped before crossings are found. A ruling
 * that lands exactly on a sample (the view centre here) is set once.
 */

import { describe, it, expect } from 'vitest';

import { placeAntiqueNumerals } from '../../../../src/utils/gpu/antiqueLook/placeAntiqueNumerals';
import type { ViewBasis } from '../../../../src/@types/camera/projection/ViewBasis';
import type { AntiqueGlyphInstance } from '../../../../src/@types/rendering/AntiqueGlyphInstance';
import { ANTIQUE_NUMERAL_INSET_UNITS } from '../../../../src/data/rendering/antiqueLook';

const FRUSTUM = { tanLeft: -1.0264, tanRight: 1.0264, tanDown: -0.5774, tanUp: 0.5774 };
const SIZE = { width: 1600, height: 900 };
// Digit d sits at x = 10·d on a 100 × 10 sheet, so a glyph's rect names its digit.
const SHEET = {
  width: 100,
  height: 10,
  glyphs: Object.fromEntries(
    [...'0123456789'].map((d, i) => [d, { x: i * 10, y: 0, w: 10, h: 10 }]),
  ),
};

/** Looking along the equator at `raDeg` with north up: east (rising RA) on the left. */
function lookingAt(raDeg: number): ViewBasis {
  const a = (raDeg * Math.PI) / 180;
  return {
    forward: [Math.cos(a), Math.sin(a), 0],
    right: [Math.sin(a), -Math.cos(a), 0],
    up: [0, 0, 1],
  };
}

/** The top border's numbers, left to right. */
function topLabels(raDeg: number): string[] {
  const glyphs = placeAntiqueNumerals({
    basis: lookingAt(raDeg),
    frustum: FRUSTUM,
    size: SIZE,
    unitPx: 1,
    rulings: { raDeg: 15, decDeg: 15 },
    sheet: SHEET,
  }).filter((g) => Math.abs(g.centrePx[1] - ANTIQUE_NUMERAL_INSET_UNITS) < 1e-6);
  const numbers: { x: number; text: string }[] = [];
  let last: AntiqueGlyphInstance | undefined;
  for (const g of glyphs) {
    const digit = String(Math.round(g.rect[0] * 10));
    // A number's digits abut; a gap starts the next number.
    const abuts =
      last !== undefined &&
      Math.abs(last.centrePx[0] + last.halfPx[0] - (g.centrePx[0] - g.halfPx[0])) < 1e-6;
    if (abuts) numbers[numbers.length - 1]!.text += digit;
    else numbers.push({ x: g.centrePx[0], text: digit });
    last = g;
  }
  return numbers.sort((a, b) => a.x - b.x).map((n) => n.text);
}

describe('placeAntiqueNumerals', () => {
  it('numbers RA 0 as 0, with 15 east (left) of it and 345 west (right)', () => {
    const labels = topLabels(0);
    expect(labels).not.toContain('360');
    const at = (text: string) => labels.indexOf(text);
    expect(at('0')).toBeGreaterThan(0);
    expect(at('15')).toBe(at('0') - 1);
    expect(at('345')).toBe(at('0') + 1);
  });

  it('numbers straight across the atan2 seam at RA 180', () => {
    const labels = topLabels(180);
    const at = (text: string) => labels.indexOf(text);
    expect(at('180')).toBeGreaterThan(0);
    expect(at('195')).toBe(at('180') - 1);
    expect(at('165')).toBe(at('180') + 1);
  });
});

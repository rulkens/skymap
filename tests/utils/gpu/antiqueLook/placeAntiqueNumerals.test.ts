/**
 * placeAntiqueNumerals — the top border must read longitude across both seams:
 * 0, where the label wraps 360 → 0, and 180, where `atan2` jumps and the
 * samples have to be unwrapped before crossings are found. A ruling that lands
 * exactly on a sample (the view centre here) is set once. Over a ruled globe the
 * border reads the globe's own longitude, counted from its prime meridian, and
 * never interpolates a number across the horizon where the frames switch. A side
 * number stays inside the strip the plate shader inks numbers in, however long.
 */

import { describe, it, expect } from 'vitest';

import { placeAntiqueNumerals } from '../../../../src/utils/gpu/antiqueLook/placeAntiqueNumerals';
import { rulingLonLat } from '../../../../src/utils/gpu/antiqueLook/rulingLonLat';
import { rayThroughPx } from '../../../../src/utils/camera/projection/rayThroughPx';
import type { ViewBasis } from '../../../../src/@types/camera/projection/ViewBasis';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { AntiqueGlyphInstance } from '../../../../src/@types/rendering/AntiqueGlyphInstance';
import type { AntiquePlateRulings } from '../../../../src/@types/rendering/AntiquePlateRulings';
import type { AntiqueRulingFrame } from '../../../../src/@types/rendering/AntiqueRulingFrame';
import type { ScreenRectPx } from '../../../../src/@types/rendering/ScreenRectPx';
import {
  ANTIQUE_LADDER_UNITS,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_NUMERAL_UNITS,
} from '../../../../src/data/rendering/antiqueLook';
import { ANTIQUE_SIDE_NUMERAL_REACH_UNITS } from '../../../../src/data/rendering/antiqueRulings';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const FRUSTUM = { tanLeft: -1.0264, tanRight: 1.0264, tanDown: -0.5774, tanUp: 0.5774 };
const NARROW = { tanLeft: -0.3, tanRight: 0.3, tanDown: -0.17, tanUp: 0.17 };
const SIZE = { width: 1600, height: 900 };
// Digit d sits at x = 10·d on a 120 × 10 sheet, then ° and ’, so a glyph's rect names it.
const SHEET = {
  width: 120,
  height: 10,
  baseline: 0.8,
  glyphs: Object.fromEntries(
    [...'0123456789°’'].map((d, i) => [d, { x: i * 10, y: 0, w: 10, h: 10 }]),
  ),
};

/** Equatorial axes, every `stepDeg`. */
function frame(stepDeg: number, extra: Partial<AntiqueRulingFrame> = {}): AntiqueRulingFrame {
  const step = { stepDeg, cellDeg: stepDeg / 5 };
  return {
    axes: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    lonOffsetDeg: 0,
    globeCentre: null,
    net: 1,
    lon: step,
    lat: step,
    ...extra,
  };
}

/** Looking along the equator at `raDeg` with north up: east (rising RA) on the left. */
function lookingAt(raDeg: number): ViewBasis {
  const a = (raDeg * Math.PI) / 180;
  return {
    forward: [Math.cos(a), Math.sin(a), 0],
    right: [Math.sin(a), -Math.cos(a), 0],
    up: [0, 0, 1],
  };
}

/** Straight down on a globe's (lon 0, lat 0) from two radii out, north up, east right. */
const OVER_PRIME_MERIDIAN: ViewBasis = { forward: [-1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] };

/** The top border's numbers, left to right, with where each stands. */
function topNumbers(
  basis: ViewBasis,
  rulings: AntiquePlateRulings,
  frustum = FRUSTUM,
  cartouche: ScreenRectPx | null = null,
): { x: number; left: number; right: number; text: string }[] {
  const glyphs = placeAntiqueNumerals({
    projection: { kind: 'rectilinear', basis, frustum, size: SIZE },
    unitPx: 1,
    rulings,
    sheet: SHEET,
    cartouche,
  })
    .filter((g) => Math.abs(g.centrePx[1] - ANTIQUE_NUMERAL_INSET_UNITS) < 1e-6)
    .sort((p, q) => p.centrePx[0] - q.centrePx[0]);
  const numbers: { left: number; right: number; text: string }[] = [];
  for (const g of glyphs) {
    const digit = String(Math.round(g.rect[0] * 12));
    const last = numbers[numbers.length - 1];
    // A number's digits abut; a gap starts the next number.
    if (last && Math.abs(last.right - (g.centrePx[0] - g.halfPx[0])) < 1e-6) {
      last.text += digit;
      last.right = g.centrePx[0] + g.halfPx[0];
    } else
      numbers.push({
        left: g.centrePx[0] - g.halfPx[0],
        right: g.centrePx[0] + g.halfPx[0],
        text: digit,
      });
  }
  return numbers.map((n) => ({ ...n, x: (n.left + n.right) / 2 }));
}

const topLabels = (raDeg: number, stepDeg = 15) =>
  topNumbers(lookingAt(raDeg), { sky: frame(stepDeg), globe: null }).map((n) => n.text);

describe('placeAntiqueNumerals', () => {
  it('numbers longitude 0 as 0, with 15 east (left) of it and 345 west (right)', () => {
    const labels = topLabels(0);
    expect(labels).not.toContain('360');
    const at = (text: string) => labels.indexOf(text);
    expect(at('0')).toBeGreaterThan(0);
    expect(at('15')).toBe(at('0') - 1);
    expect(at('345')).toBe(at('0') + 1);
  });

  it('numbers straight across the atan2 seam at 180', () => {
    const labels = topLabels(180);
    const at = (text: string) => labels.indexOf(text);
    expect(at('180')).toBeGreaterThan(0);
    expect(at('195')).toBe(at('180') - 1);
    expect(at('165')).toBe(at('180') + 1);
  });

  it('sets no number near a corner, where two edges would collide', () => {
    // Rulings every 2° (~35 px apart) leave no gap wide enough to miss the
    // corner by chance; the leftmost number still stands clear of it.
    const leftmost = topNumbers(lookingAt(0), { sky: frame(2), globe: null })[0]!;
    expect(leftmost.left).toBeGreaterThan(ANTIQUE_LADDER_UNITS + 20);
  });

  it('leaves out a number the cartouche would cover or crowd, and only that one', () => {
    const all = topNumbers(lookingAt(0), { sky: frame(15), globe: null });
    const hit = all[1]!;
    // A cartouche ending just short of the number still crowds it; the rest stand.
    const cartouche = { x0: 40, y0: 40, x1: hit.left - 2, y1: 300 };
    const kept = topNumbers(lookingAt(0), { sky: frame(15), globe: null }, FRUSTUM, cartouche);
    expect(kept.map((n) => n.text)).not.toContain(hit.text);
    expect(kept.map((n) => n.text)).toContain(all[2]!.text);
  });

  it('lets a number wait for room rather than run into its neighbour', () => {
    // At 2° the crossings come ~35 px apart, closer than numbers 22 px tall can stand.
    const numbers = topNumbers(lookingAt(0), { sky: frame(2), globe: null });
    const gaps = numbers.slice(1).map((n, i) => n.left - numbers[i]!.right);
    expect(gaps.every((gap) => gap > 0.5 * ANTIQUE_NUMERAL_UNITS)).toBe(true);
  });

  it("reads a globe's longitude from its prime meridian where the border lies over it", () => {
    // Prime meridian 16.6° west of the axis: the axis reads 16.6, so 15 stands 1.6° left
    // of the centre and 20 stands 3.4° right of it, while the sky would read 180 here.
    const globe = frame(5, { globeCentre: [-2, 0, 0], lonOffsetDeg: 16.6 });
    const numbers = topNumbers(OVER_PRIME_MERIDIAN, { sky: frame(5), globe }, NARROW);
    const at = (text: string) => numbers.find((n) => n.text === text)!.x - SIZE.width / 2;
    expect(at('15')).toBeLessThan(0);
    expect(at('20')).toBeGreaterThan(0);
    expect(Math.abs(at('15'))).toBeLessThan(Math.abs(at('20')));
    expect(numbers.map((n) => n.text)).not.toContain('180');
  });

  it('keeps a long side number on the plate, inside the strip numbers are inked in', () => {
    // Dec 52.25°–52.75° at 5′: no whole degree, so the first left number carries "52°20’".
    const a = (52.5 * Math.PI) / 180;
    const basis: ViewBasis = {
      forward: [Math.cos(a), 0, Math.sin(a)],
      right: [0, -1, 0],
      up: [-Math.sin(a), 0, Math.cos(a)],
    };
    const tan = Math.tan((0.25 * Math.PI) / 180);
    const frustum = { tanLeft: -tan * 1.78, tanRight: tan * 1.78, tanDown: -tan, tanUp: tan };
    const glyphs = placeAntiqueNumerals({
      projection: { kind: 'rectilinear', basis, frustum, size: SIZE },
      unitPx: 1,
      rulings: { sky: frame(5 / 60), globe: null },
      sheet: SHEET,
      cartouche: null,
    });
    // Clear of the top and bottom rows, whose minutes sit a little off their line.
    const rows = ANTIQUE_NUMERAL_INSET_UNITS + ANTIQUE_NUMERAL_UNITS;
    const isLeft = (g: AntiqueGlyphInstance) =>
      g.centrePx[0] < SIZE.width / 4 && g.centrePx[1] > rows && g.centrePx[1] < SIZE.height - rows;
    const left = glyphs.filter(isLeft);
    // The plate shader inks numbers only within its reach of the edge.
    const reach = readShaderSource('src/services/gpu/shaders/antiqueLook/fragment.wesl').match(
      /NUMERAL_SIDE_REACH: f32 = ([\d.]+)/,
    );
    expect(Number(reach?.[1])).toBe(ANTIQUE_SIDE_NUMERAL_REACH_UNITS);
    expect(left.some((g) => Math.round(g.rect[0] * 12) === 10)).toBe(true); // the carry's °
    for (const g of left) {
      expect(g.centrePx[0] - g.halfPx[0]).toBeGreaterThan(ANTIQUE_LADDER_UNITS);
      expect(g.centrePx[0] + g.halfPx[0]).toBeLessThan(ANTIQUE_SIDE_NUMERAL_REACH_UNITS + 1e-9);
    }
  });

  it('never numbers a crossing interpolated across the horizon', () => {
    // A globe whose limb crosses the top border: every number must read the frame under it.
    const globe = frame(10, { globeCentre: [-3, -1.8, 1.63], lonOffsetDeg: 16.6 });
    const sky = frame(10);
    const basis = OVER_PRIME_MERIDIAN;
    const numbers = topNumbers(basis, { sky, globe });
    const rayAt = (x: number) =>
      rayThroughPx([x, ANTIQUE_LADDER_UNITS], basis, FRUSTUM, SIZE) as Vec3;
    const overGlobe = numbers.filter((n) => rulingLonLat(globe, rayAt(n.x)) !== null);
    expect(overGlobe.length).toBeGreaterThan(0);
    expect(overGlobe.length).toBeLessThan(numbers.length);
    for (const { x, text } of numbers) {
      const lon = (rulingLonLat(globe, rayAt(x)) ?? rulingLonLat(sky, rayAt(x))!)[0];
      const off = Math.abs(((lon - Number(text) + 540) % 360) - 180);
      expect(off, `number ${text} at x ${x.toFixed(0)}`).toBeLessThan(2);
    }
  });
});

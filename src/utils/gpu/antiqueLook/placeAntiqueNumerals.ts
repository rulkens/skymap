/**
 * placeAntiqueNumerals — the border's numbering: where each edge of the plate
 * crosses a round value of the coordinate its degree ladder counts (right
 * ascension along top and bottom, declination up the sides, the shader's
 * `neatline` split), the value is set in digits just inside the inner rule.
 * The values are the plate's own ruling intervals, so each number sits where
 * a meridian or parallel meets the border.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import type { AntiqueRulings } from '../../../@types/rendering/AntiqueRulings';
import type { Size } from '../../../@types/rendering/Size';
import {
  ANTIQUE_LADDER_UNITS,
  ANTIQUE_MAX_GLYPHS,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_NUMERAL_UNITS,
} from '../../../data/rendering/antiqueLook';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';
import { wrapRad } from '../../math/wrapRad';
import { setAntiqueDigits } from './setAntiqueDigits';

const SAMPLES = 96;
// No number within this many print units of a corner, where two edges' numbers meet.
const CORNER_CLEAR_UNITS = 40;
// Space kept between neighbouring numbers on an edge, in numeral heights: where
// meridians converge, the next number waits for room.
const NUMBER_GAP = 0.6;
const DEG = 180 / Math.PI;

export function placeAntiqueNumerals(input: {
  readonly basis: ViewBasis;
  readonly frustum: ViewFrustum;
  readonly size: Size;
  readonly unitPx: number;
  /** The plate's ruling intervals: numbers stand where the rulings meet the border. */
  readonly rulings: AntiqueRulings;
  readonly sheet: Pick<AntiqueGlyphSheet, 'width' | 'height' | 'glyphs'>;
}): readonly AntiqueGlyphInstance[] {
  const { size, unitPx } = input;
  const band = ANTIQUE_LADDER_UNITS * unitPx;
  const inset = (ANTIQUE_NUMERAL_INSET_UNITS - ANTIQUE_LADDER_UNITS) * unitPx;
  const out: AntiqueGlyphInstance[] = [];
  // Each edge: the numbers' line, and the ladder's line (whose coordinate they read).
  const edges = [
    { from: [band, band], to: [size.width - band, band], text: [0, inset], ra: true },
    {
      from: [band, size.height - band],
      to: [size.width - band, size.height - band],
      text: [0, -inset],
      ra: true,
    },
    { from: [band, band], to: [band, size.height - band], text: [inset, 0], ra: false },
    {
      from: [size.width - band, band],
      to: [size.width - band, size.height - band],
      text: [-inset, 0],
      ra: false,
    },
  ] as const;
  for (const edge of edges) {
    const values: number[] = [];
    const points: [number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const p: [number, number] = [
        edge.from[0] + (edge.to[0] - edge.from[0]) * t,
        edge.from[1] + (edge.to[1] - edge.from[1]) * t,
      ];
      const d = rayThroughPx(p, input.basis, input.frustum, size);
      const len = Math.hypot(d[0], d[1], d[2]);
      const v = edge.ra ? Math.atan2(d[1], d[0]) * DEG : Math.asin(d[2] / len) * DEG;
      // Unwrap right ascension across its 0/360 seam so crossings interpolate.
      const prev = values[values.length - 1];
      values.push(prev === undefined ? v : prev + wrapRad((v - prev) / DEG) * DEG);
      points.push(p);
    }
    const step = edge.ra ? input.rulings.raDeg : input.rulings.decDeg;
    const edgeLen = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]);
    const clear = CORNER_CLEAR_UNITS * unitPx;
    // How far along the edge's axis the previous number reaches.
    let lastReach = -Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const a = values[i]!;
      const b = values[i + 1]!;
      // Half-open (min, max]: a ruling that falls exactly on a sample is set once, not twice.
      const k = Math.floor(Math.min(a, b) / step) + 1;
      if (k * step > Math.max(a, b)) continue;
      const value = k * step;
      const t = (value - a) / (b - a);
      const along = ((i + t) / SAMPLES) * edgeLen;
      if (along < clear || along > edgeLen - clear) continue;
      const at: [number, number] = [
        points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t + edge.text[0],
        points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t + edge.text[1],
      ];
      const label = edge.ra ? String(((value % 360) + 360) % 360) : String(Math.abs(value));
      const before = out.length;
      setAntiqueDigits(label, at, unitPx, input.sheet, out);
      const axis = edge.ra ? 0 : 1;
      const set = out.slice(before);
      const start = Math.min(...set.map((g) => g.centrePx[axis] - g.halfPx[axis]));
      if (start < lastReach + NUMBER_GAP * ANTIQUE_NUMERAL_UNITS * unitPx) {
        out.length = before;
        continue;
      }
      lastReach = Math.max(...set.map((g) => g.centrePx[axis] + g.halfPx[axis]));
      if (out.length >= ANTIQUE_MAX_GLYPHS) return out.slice(0, ANTIQUE_MAX_GLYPHS);
    }
  }
  return out;
}

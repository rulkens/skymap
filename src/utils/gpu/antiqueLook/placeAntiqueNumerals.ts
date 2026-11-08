/**
 * placeAntiqueNumerals — the border's numbering: where each edge of the plate
 * crosses a ruling of the frame beneath it (longitude along top and bottom,
 * latitude up the sides, the shader's `neatline` split), the value is set just
 * inside the inner rule. A stretch of border over a ruled globe reads the
 * globe's frame, the rest the sky's (`AntiquePlateRulings`), and no crossing is
 * read across the switch. Values are the frames' own intervals, so each number
 * sits where a meridian or parallel meets the border. A number the cartouche
 * would cover, or crowd within half a numeral, is left out, as an engraver cut the
 * graduation short of a title frame.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import type { AntiquePlateRulings } from '../../../@types/rendering/AntiquePlateRulings';
import type { AntiqueRulingFrame } from '../../../@types/rendering/AntiqueRulingFrame';
import type { ScreenRectPx } from '../../../@types/rendering/ScreenRectPx';
import {
  ANTIQUE_LADDER_UNITS,
  ANTIQUE_MAX_GLYPHS,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_NUMERAL_UNITS,
} from '../../../data/rendering/antiqueLook';
import { ANTIQUE_SIDE_NUMERAL_REACH_UNITS } from '../../../data/rendering/antiqueRulings';
import { rayOfPx } from '../../camera/projection/viewProjection/rayOfPx';
import { formatAntiqueDegrees } from './formatAntiqueDegrees';
import { rulingLonLat } from './rulingLonLat';
import { setAntiqueDigits } from './setAntiqueDigits';

const SAMPLES = 96;
// No number within this many print units of a corner, where two edges' numbers meet.
const CORNER_CLEAR_UNITS = 40;
// Space kept between neighbouring numbers on an edge, in numeral heights: where
// meridians converge, the next number waits for room.
const NUMBER_GAP = 0.6;
const MINUTES_PER_TURN = 360 * 60;

export function placeAntiqueNumerals(input: {
  readonly projection: ViewProjection;
  readonly unitPx: number;
  readonly rulings: AntiquePlateRulings;
  readonly sheet: Pick<AntiqueGlyphSheet, 'width' | 'height' | 'baseline' | 'glyphs'>;
  /** The title cartouche, device px. */
  readonly cartouche: ScreenRectPx | null;
}): readonly AntiqueGlyphInstance[] {
  const { projection, unitPx, rulings, cartouche } = input;
  const { size } = projection;
  const crowd = 0.5 * ANTIQUE_NUMERAL_UNITS * unitPx;
  const band = ANTIQUE_LADDER_UNITS * unitPx;
  const inset = (ANTIQUE_NUMERAL_INSET_UNITS - ANTIQUE_LADDER_UNITS) * unitPx;
  const out: AntiqueGlyphInstance[] = [];
  // Each edge: the ladder's line (whose coordinate the numbers read), and the numbers' offset.
  const edges = [
    { from: [band, band], to: [size.width - band, band], text: [0, inset], lon: true },
    {
      from: [band, size.height - band],
      to: [size.width - band, size.height - band],
      text: [0, -inset],
      lon: true,
    },
    { from: [band, band], to: [band, size.height - band], text: [inset, 0], lon: false },
    {
      from: [size.width - band, band],
      to: [size.width - band, size.height - band],
      text: [-inset, 0],
      lon: false,
    },
  ] as const;
  for (const edge of edges) {
    const values: number[] = [];
    // A sample outside the projection (past a fisheye's disc) reads no frame.
    const frames: (AntiqueRulingFrame | null)[] = [];
    const points: [number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const p: [number, number] = [
        edge.from[0] + (edge.to[0] - edge.from[0]) * t,
        edge.from[1] + (edge.to[1] - edge.from[1]) * t,
      ];
      const d = rayOfPx(projection, p);
      const onGlobe = d && rulings.globe && rulingLonLat(rulings.globe, d);
      const frame = d === null ? null : onGlobe ? rulings.globe! : rulings.sky;
      const v = d === null ? NaN : (onGlobe || rulingLonLat(rulings.sky, d)!)[edge.lon ? 0 : 1];
      // Unwrap longitude across its ±180 seam so crossings interpolate.
      const prev = frames[i - 1] === frame ? values[i - 1]! : v;
      values.push(prev + (((v - prev + 540) % 360) - 180));
      frames.push(frame);
      points.push(p);
    }
    const edgeLen = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]);
    const clear = CORNER_CLEAR_UNITS * unitPx;
    const crossings: { minutes: number; at: [number, number] }[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      if (frames[i] === null || frames[i] !== frames[i + 1]) continue;
      const step = frames[i]![edge.lon ? 'lon' : 'lat'].stepDeg;
      const a = values[i]!;
      const b = values[i + 1]!;
      // Half-open (min, max]: a ruling that falls exactly on a sample is set once, not twice.
      const k = Math.floor(Math.min(a, b) / step) + 1;
      if (k * step > Math.max(a, b)) continue;
      const t = (k * step - a) / (b - a);
      const along = ((i + t) / SAMPLES) * edgeLen;
      if (along < clear || along > edgeLen - clear) continue;
      const m = Math.round(k * step * 60);
      crossings.push({
        minutes: edge.lon
          ? ((m % MINUTES_PER_TURN) + MINUTES_PER_TURN) % MINUTES_PER_TURN
          : Math.abs(m),
        at: [
          points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t + edge.text[0],
          points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t + edge.text[1],
        ],
      });
    }
    // An edge with no whole degree on it names one in its first number.
    const carry = !crossings.some((c) => c.minutes % 60 === 0);
    // How far along the edge's axis the previous number reaches.
    let lastReach = -Infinity;
    for (const [n, { minutes, at }] of crossings.entries()) {
      const before = out.length;
      setAntiqueDigits(
        formatAntiqueDegrees(minutes / 60, carry && n === 0),
        at,
        unitPx,
        input.sheet,
        out,
      );
      if (!edge.lon) fitSideNumber(out, before, edge.text[0] > 0, size.width, unitPx);
      const axis = edge.lon ? 0 : 1;
      const set = out.slice(before);
      if (
        cartouche &&
        set.some(
          (g) =>
            g.centrePx[0] + g.halfPx[0] + crowd > cartouche.x0 &&
            g.centrePx[0] - g.halfPx[0] - crowd < cartouche.x1 &&
            g.centrePx[1] + g.halfPx[1] + crowd > cartouche.y0 &&
            g.centrePx[1] - g.halfPx[1] - crowd < cartouche.y1,
        )
      ) {
        out.length = before;
        continue;
      }
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

/** A side number's glyphs (from `before` on) moved to start half a numeral short of the
 * numerals' inset and run inward, shrunk about that start if they would pass the reach. */
function fitSideNumber(
  out: AntiqueGlyphInstance[],
  before: number,
  fromLeft: boolean,
  width: number,
  unitPx: number,
): void {
  const set = out.slice(before);
  if (set.length === 0) return;
  const start = (ANTIQUE_NUMERAL_INSET_UNITS - ANTIQUE_NUMERAL_UNITS / 2) * unitPx;
  const room = ANTIQUE_SIDE_NUMERAL_REACH_UNITS * unitPx - start;
  const lo = Math.min(...set.map((g) => g.centrePx[0] - g.halfPx[0]));
  const hi = Math.max(...set.map((g) => g.centrePx[0] + g.halfPx[0]));
  const k = Math.min(1, room / (hi - lo));
  const anchor = fromLeft ? lo : hi;
  const to = fromLeft ? start : width - start;
  const y = set.reduce((sum, g) => sum + g.centrePx[1], 0) / set.length;
  out.splice(
    before,
    set.length,
    ...set.map(
      (g): AntiqueGlyphInstance => ({
        ...g,
        centrePx: [to + (g.centrePx[0] - anchor) * k, y + (g.centrePx[1] - y) * k],
        halfPx: [g.halfPx[0] * k, g.halfPx[1] * k],
      }),
    ),
  );
}

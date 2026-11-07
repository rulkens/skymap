/**
 * placeAntiqueNumerals — the border's numbering: where each edge of the plate
 * crosses a round value of the coordinate its degree ladder counts (right
 * ascension along top and bottom, declination up the sides, the shader's
 * `neatline` split), the value is set in digits just inside the inner rule.
 * Spacing follows the zoom, so numbers stay about a thumb's width apart.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { AntiqueGlyphInstance } from '../../../@types/rendering/AntiqueGlyphInstance';
import type { AntiqueGlyphSheet } from '../../../@types/rendering/AntiqueGlyphSheet';
import type { Size } from '../../../@types/rendering/Size';
import {
  ANTIQUE_LADDER_UNITS,
  ANTIQUE_MAX_GLYPHS,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_NUMERAL_UNITS,
} from '../../../data/rendering/antiqueLook';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';

const SAMPLES = 96;
const STEPS = [1, 2, 5, 10, 15, 20, 30, 45, 90] as const;
const MIN_GAP_UNITS = 90;
const DEG = 180 / Math.PI;

type Sheet = Pick<AntiqueGlyphSheet, 'width' | 'height' | 'glyphs'>;

export function placeAntiqueNumerals(input: {
  readonly basis: ViewBasis;
  readonly frustum: ViewFrustum;
  readonly size: Size;
  readonly unitPx: number;
  readonly sheet: Sheet;
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
      values.push(prev === undefined ? v : prev + wrap180(v - prev));
      points.push(p);
    }
    const lengthPx = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]);
    const degPerPx = Math.abs(values[SAMPLES]! - values[0]!) / lengthPx;
    const step = STEPS.find((s) => s / Math.max(degPerPx, 1e-9) >= MIN_GAP_UNITS * unitPx) ?? 90;
    for (let i = 0; i < SAMPLES; i++) {
      const a = values[i]!;
      const b = values[i + 1]!;
      const k = Math.ceil(Math.min(a, b) / step);
      if (k * step > Math.max(a, b) || a === b) continue;
      const value = k * step;
      const t = (value - a) / (b - a);
      const at: [number, number] = [
        points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t + edge.text[0],
        points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t + edge.text[1],
      ];
      const label = edge.ra ? String(((value % 360) + 360) % 360) : String(Math.abs(value));
      setDigits(label, at, unitPx, input.sheet, out);
      if (out.length >= ANTIQUE_MAX_GLYPHS) return out.slice(0, ANTIQUE_MAX_GLYPHS);
    }
  }
  return out;
}

function setDigits(
  text: string,
  centre: readonly [number, number],
  unitPx: number,
  sheet: Sheet,
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

function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

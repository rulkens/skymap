/**
 * The Skymap mark, "Void": one cell of the cosmic web, an empty void walled by filaments that thin
 * between the clusters at its corners and run on out of the tile. SVG markup in a 0..100 square, for
 * skymapIcon to set on a tile. Colours are SVG 1.1 hex and opacity so sharp's librsvg draws it as
 * Chromium does.
 */
import type { MarkDrawing } from '../@types/MarkDrawing';
import { MARK_COLOURS } from '../data/markColours';
import { quadPoint } from './quadPoint';
import { taperPath } from './taperPath';

// x, y, radius: five clusters round a void that is not quite a regular pentagon.
const CLUSTERS = [
  [30, 27, 4.2],
  [71, 21, 3],
  [83, 57, 5.2],
  [55, 81, 3.4],
  [21, 63, 2.6],
] as const;
// Each wall's own nudge, so the five do not bow by the same rule.
const BOW = [
  [2, -5],
  [5, 1],
  [1, 6],
  [-4, 3],
  [-6, -2],
] as const;
// Where the filament leaving each cluster crosses out of the tile.
const RUNS_OUT = [
  [12, -6],
  [86, -8],
  [108, 64],
  [62, 108],
  [-8, 74],
] as const;
const CENTRE = [52, 50] as const;

export function voidMark(drawing: MarkDrawing): string {
  const small = drawing === 'small';
  const { fg, fgTertiary, accent } = MARK_COLOURS;
  const w = small ? 8 : 3.6;
  // Walls bow outward (voids are round) and thin between clusters, where the matter has drained away.
  const walls = CLUSTERS.map((a, i) => {
    const b = CLUSTERS[(i + 1) % CLUSTERS.length]!;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    const out = Math.hypot(m[0] - CENTRE[0], m[1] - CENTRE[1]);
    const k = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08;
    const bend = [
      m[0] + ((m[0] - CENTRE[0]) / out) * k + BOW[i]![0] * 0.3,
      m[1] + ((m[1] - CENTRE[1]) / out) * k + BOW[i]![1] * 0.3,
    ] as const;
    const width = (t: number) => w * (small ? 1 : 0.3 + 1.6 * Math.abs(t - 0.5));
    const d = taperPath(quadPoint([a[0], a[1]], bend, [b[0], b[1]]), width, 60);
    return `<path d="${d}" fill="${fg}" fill-opacity="${small ? 0.85 : 0.75}"/>`;
  });
  const runs = small
    ? []
    : RUNS_OUT.map((e, i) => {
        const a = CLUSTERS[i]!;
        const bend = [(a[0] + e[0]) / 2 + 3, (a[1] + e[1]) / 2 - 2] as const;
        const d = taperPath(quadPoint([a[0], a[1]], bend, e), (t) => 2.6 * (1 - 0.7 * t));
        return `<defs><linearGradient id="run${i}" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${e[0]}" y2="${e[1]}"><stop offset="0" stop-color="${fg}" stop-opacity="0.6"/><stop offset="0.55" stop-color="${fgTertiary}" stop-opacity="0.25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><path d="${d}" fill="url(#run${i})"/>`;
      });
  const knots = CLUSTERS.map(
    ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${small ? r * 1.9 : r}" fill="${fg}"/>`,
  );
  return [...runs, ...walls, ...knots].join('');
}

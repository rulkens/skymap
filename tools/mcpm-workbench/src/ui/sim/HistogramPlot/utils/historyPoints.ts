import type { Vec2 } from '../../../../../../../src/@types/math/Vec2';

/**
 * The convergence history as polyline points in a `width` × `height` box: one
 * x step per sample, newest at the right, y scaled to the history's own
 * finite min–max (it shares no axis with the bars). Non-finite samples are
 * skipped; fewer than two finite samples make no line.
 */
export function historyPoints(history: readonly number[], width: number, height: number): Vec2[] {
  let min = Infinity;
  let max = -Infinity;
  let finiteCount = 0;
  for (const value of history) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    finiteCount++;
  }
  if (finiteCount < 2) return [];
  const span = max - min;
  const step = width / (history.length - 1);
  const points: Vec2[] = [];
  history.forEach((value, i) => {
    if (!Number.isFinite(value)) return;
    const t = span > 0 ? (value - min) / span : 0.5;
    points.push([i * step, height * (1 - t)]);
  });
  return points;
}

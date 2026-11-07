/**
 * windowExtremum — max or min of `values` (laid out as `grid`) over a box
 * `radiusKm` across on the ground: rows first, each with a column half-width
 * that grows as 1/cos(lat) so the box stays square in km, then columns. Rows
 * wrap when the grid spans every longitude; its top and bottom repeat. The
 * column pass runs van Herk on whole rows at a time: a strided per-column
 * walk misses the cache on every post of a 32k-wide grid.
 */

import type { HeightGrid } from '../@types/HeightGrid';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import { slidingWindowMax } from './slidingWindowMax';

const KM_PER_DEG = 111.195;
/** Floor on cos(lat) near the poles, so a window never spans the whole row. */
const MIN_COS_LAT = 0.05;

export function windowExtremum(
  values: Float32Array,
  grid: HeightGrid,
  radiusKm: number,
  op: 'max' | 'min',
): Float32Array {
  const { nx, ny, j0, wraps } = grid;
  // A min is the negated max of the negated values.
  const sign = op === 'max' ? 1 : -1;
  const step = heightLatticeStepDeg(grid.z);
  const postKm = step * KM_PER_DEG;
  const rows = new Float32Array(nx * ny);
  const line = new Float32Array(nx);
  for (let jj = 0; jj < ny; jj++) {
    const cosLat = Math.max(MIN_COS_LAT, Math.cos(((90 - (j0 + jj) * step) * Math.PI) / 180));
    const rx = Math.min(
      Math.floor((nx - 1) / 2),
      Math.max(1, Math.round(radiusKm / (postKm * cosLat))),
    );
    for (let ii = 0; ii < nx; ii++) line[ii] = sign * values[jj * nx + ii]!;
    rows.set(slidingWindowMax(line, rx, wraps), jj * nx);
  }

  const ry = Math.max(1, Math.round(radiusKm / postKm));
  const w = 2 * ry + 1;
  const m = ny + 2 * ry;
  const rowAt = (p: number) => Math.min(ny - 1, Math.max(0, p - ry)) * nx;
  const forward = new Float32Array(m * nx);
  const backward = new Float32Array(m * nx);
  for (let p = 0; p < m; p++) {
    const src = rowAt(p);
    if (p % w === 0) {
      forward.set(rows.subarray(src, src + nx), p * nx);
      continue;
    }
    for (let ii = 0; ii < nx; ii++) {
      const v = rows[src + ii]!;
      const prev = forward[(p - 1) * nx + ii]!;
      forward[p * nx + ii] = v > prev ? v : prev;
    }
  }
  for (let p = m - 1; p >= 0; p--) {
    const src = rowAt(p);
    if (p % w === w - 1 || p === m - 1) {
      backward.set(rows.subarray(src, src + nx), p * nx);
      continue;
    }
    for (let ii = 0; ii < nx; ii++) {
      const v = rows[src + ii]!;
      const next = backward[(p + 1) * nx + ii]!;
      backward[p * nx + ii] = v > next ? v : next;
    }
  }
  const out = new Float32Array(nx * ny);
  for (let jj = 0; jj < ny; jj++)
    for (let ii = 0; ii < nx; ii++) {
      const a = backward[jj * nx + ii]!;
      const b = forward[(jj + 2 * ry) * nx + ii]!;
      out[jj * nx + ii] = sign * (a > b ? a : b);
    }
  return out;
}

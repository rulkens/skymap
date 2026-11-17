import type { EquirectGrid } from '../@types/EquirectGrid';

/** Bilinear sample at (lat, lon) in radians: wraps in longitude, clamps at the poles. */
export function sampleEquirect(grid: EquirectGrid, lat: number, lon: number): number {
  const { width: w, height: h, data } = grid;
  const u = ((((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1) * w - 0.5;
  const v = (0.5 - lat / Math.PI) * h - 0.5;
  const x = Math.floor(u);
  const fx = u - x;
  const y0 = Math.min(Math.max(Math.floor(v), 0), h - 2);
  const fy = Math.min(Math.max(v - y0, 0), 1);
  const x0 = ((x % w) + w) % w;
  const x1 = (x0 + 1) % w;
  const r0 = y0 * w;
  const r1 = r0 + w;
  const top = data[r0 + x0]! * (1 - fx) + data[r0 + x1]! * fx;
  const bottom = data[r1 + x0]! * (1 - fx) + data[r1 + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

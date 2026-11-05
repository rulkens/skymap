import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Bilinear sample of an equirectangular (galactic l, b) radius plane for a unit direction. */
export function radiusAtDirection(
  plane: Float32Array,
  width: number,
  height: number,
  dir: Vec3,
): number {
  const l = Math.atan2(dir[1], dir[0]);
  const b = Math.asin(Math.max(-1, Math.min(1, dir[2])));
  const u = ((l / (2 * Math.PI) + 1) % 1) * width - 0.5;
  const v = (0.5 - b / Math.PI) * height - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(v)));
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = u - x0;
  const fy = v - y0;
  const xa = ((x0 % width) + width) % width;
  const xb = (xa + 1) % width;
  const s = (x: number, y: number): number => plane[y * width + x]!;
  const top = s(xa, y0) * (1 - fx) + s(xb, y0) * fx;
  const bot = s(xa, y1) * (1 - fx) + s(xb, y1) * fx;
  return top * (1 - fy) + bot * fy;
}

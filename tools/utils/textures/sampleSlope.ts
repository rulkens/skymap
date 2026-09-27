/** sampleSlope — bilinear (sx, sy) at an arbitrary lon/lat, clamped to the
 *  lattice's own extent rather than wrapping or extrapolating. */
import type { SlopeLattice } from '../../textures/SlopeLattice';

export function sampleSlope(
  lattice: SlopeLattice,
  lon: number,
  lat: number,
): readonly [sx: number, sy: number] {
  const { west, north, stepDeg, nx, ny, sx, sy } = lattice;
  const fx = Math.min(nx - 1, Math.max(0, (lon - west) / stepDeg));
  const fy = Math.min(ny - 1, Math.max(0, (north - lat) / stepDeg));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(nx - 1, x0 + 1);
  const y1 = Math.min(ny - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const bilinear = (grid: Float32Array): number => {
    const top = grid[y0 * nx + x0]! * (1 - tx) + grid[y0 * nx + x1]! * tx;
    const bottom = grid[y1 * nx + x0]! * (1 - tx) + grid[y1 * nx + x1]! * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return [bilinear(sx), bilinear(sy)];
}

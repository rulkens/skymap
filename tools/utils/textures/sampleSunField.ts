/** sampleSunField — bilinear `(gx, gy)` at an arbitrary lon/lat, clamped to
 *  the field's own extent. Confidence is not sampled: a consumer applying the
 *  field to pixels only ever needs `g` itself (design §8). */
import type { SunField } from '../../textures/SunField';

export function sampleSunField(
  field: SunField,
  lon: number,
  lat: number,
): readonly [gx: number, gy: number] {
  const { bounds, width, height, gx, gy } = field;
  const fx = Math.min(
    width - 1,
    Math.max(0, ((lon - bounds.west) / (bounds.east - bounds.west)) * (width - 1)),
  );
  const fy = Math.min(
    height - 1,
    Math.max(0, ((bounds.north - lat) / (bounds.north - bounds.south)) * (height - 1)),
  );
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const bilinear = (grid: Float32Array): number => {
    const top = grid[y0 * width + x0]! * (1 - tx) + grid[y0 * width + x1]! * tx;
    const bottom = grid[y1 * width + x0]! * (1 - tx) + grid[y1 * width + x1]! * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return [bilinear(gx), bilinear(gy)];
}

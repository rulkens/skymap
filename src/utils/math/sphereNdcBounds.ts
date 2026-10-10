/**
 * NDC [min, max] of a sphere along one screen axis. `centre`/`depth` are the
 * sphere centre's camera-space coordinate on that axis and along the view axis.
 * Full range when the eye is inside or the silhouette reaches the eye plane,
 * where the tangent blows up.
 */

const clampNdc = (v: number) => Math.min(1, Math.max(-1, v));

export function sphereNdcBounds(
  centre: number,
  depth: number,
  radius: number,
  tanHalf: number,
  pad: number,
): readonly [number, number] {
  const d2 = centre * centre + depth * depth;
  if (d2 <= radius * radius) return [-1, 1];
  const theta = Math.atan2(centre, depth);
  const alpha = Math.asin(radius / Math.sqrt(d2));
  const lo = theta - alpha;
  const hi = theta + alpha;
  if (lo <= -Math.PI / 2 || hi >= Math.PI / 2) return [-1, 1];
  return [clampNdc(Math.tan(lo) / tanHalf - pad), clampNdc(Math.tan(hi) / tanHalf + pad)];
}

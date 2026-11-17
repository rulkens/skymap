/**
 * NDC [min, max] of a sphere along one screen axis. `centre`/`depth` are the
 * sphere centre's camera-space coordinate on that axis and along the view axis;
 * `[tanLo, tanHi]` is the frustum window on that axis (off-axis allowed).
 * Full range when the eye is inside or the silhouette reaches the eye plane,
 * where the tangent blows up.
 */

const clampNdc = (v: number) => Math.min(1, Math.max(-1, v));

export function sphereNdcBounds(
  centre: number,
  depth: number,
  radius: number,
  tanLo: number,
  tanHi: number,
  pad: number,
): readonly [number, number] {
  const d2 = centre * centre + depth * depth;
  if (d2 <= radius * radius) return [-1, 1];
  const theta = Math.atan2(centre, depth);
  const alpha = Math.asin(radius / Math.sqrt(d2));
  const lo = theta - alpha;
  const hi = theta + alpha;
  if (lo <= -Math.PI / 2 || hi >= Math.PI / 2) return [-1, 1];
  const toNdc = (t: number) => (2 * (t - tanLo)) / (tanHi - tanLo) - 1;
  return [clampNdc(toNdc(Math.tan(lo)) - pad), clampNdc(toNdc(Math.tan(hi)) + pad)];
}

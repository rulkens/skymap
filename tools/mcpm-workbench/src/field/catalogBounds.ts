import type { Vec3 } from '../../../../src/@types/math/Vec3';

/**
 * catalogBounds — per-axis min/max over interleaved xyz positions.
 *
 * Seeded from point 0 rather than ±Infinity, so a single-point (or any
 * non-empty) input can never leave a stale sentinel on an axis nothing
 * beat.
 */
export function catalogBounds(positions: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [positions[0]!, positions[1]!, positions[2]!];
  const max: Vec3 = [positions[0]!, positions[1]!, positions[2]!];
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

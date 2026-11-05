import type { Vec3 } from '../../../src/@types/math/Vec3';
import { normalize3 } from '../../../src/utils/math/normalize3';

/**
 * Mean (unit) direction of the vertices whose radius sits in the top
 * `fraction` of `radii` — used by the Local Bubble bake's chimney assertion,
 * where the outermost few percent of the shell should point toward the
 * galactic pole.
 */
export function meanDirectionOfLargest(
  dirs: readonly Vec3[],
  radii: readonly number[],
  fraction: number,
): Vec3 {
  const order = radii
    .map((radius, index) => ({ radius, index }))
    .sort((a, b) => b.radius - a.radius);
  const count = Math.max(1, Math.floor(dirs.length * fraction));
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < count; i++) {
    const d = dirs[order[i]!.index]!;
    sx += d[0];
    sy += d[1];
    sz += d[2];
  }
  return normalize3([sx, sy, sz]);
}

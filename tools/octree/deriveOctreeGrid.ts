import type { Vec3 } from '../../src/@types/math/Vec3';
import type { OctreeGrid } from '../../src/@types/octree/OctreeGrid';

/**
 * The grid over flat `[x, y, z, …]` positions: the origin is the min corner, and the cell edge
 * divides the largest axis span into `2^bits` cells so every record lands inside. An empty or
 * single-point population falls back to a unit cell.
 */
export function deriveOctreeGrid(positions: ArrayLike<number>, bits: number): OctreeGrid {
  if (positions.length === 0) return { bits, cellEdge: 1, origin: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const a = i % 3;
    if (positions[i]! < min[a]!) min[a] = positions[i]!;
    if (positions[i]! > max[a]!) max[a] = positions[i]!;
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  // A hair of headroom so the max-corner record floors to cell < 2^bits rather than exactly 2^bits.
  const cellEdge = extent > 0 ? (extent * (1 + 1e-9)) / 2 ** bits : 1;
  return { bits, cellEdge, origin: min };
}

import type { HeightTile } from '../../textures/@types/HeightTile';

/**
 * heightTileBounds — a tile's `subtreeMin/MaxM`: the range of the FINEST data
 * anywhere under it, not just its own posts. Three contributors, unioned:
 * this tile's posts, every on-disk child (recursive for free, since a
 * child's header already bounds ITS subtree), and the source's native range
 * over the tile's box, which catches a peak the lattice steps over. Wide, never narrow.
 */
export function heightTileBounds(
  own: Float32Array,
  children: ReadonlyArray<HeightTile | null>,
  sourceBounds: readonly [number, number] | null,
): { subtreeMinM: number; subtreeMaxM: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of own) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  for (const child of children) {
    if (child === null) continue;
    min = Math.min(min, child.subtreeMinM);
    max = Math.max(max, child.subtreeMaxM);
  }
  if (sourceBounds !== null) {
    min = Math.min(min, sourceBounds[0]);
    max = Math.max(max, sourceBounds[1]);
  }
  return { subtreeMinM: min, subtreeMaxM: max };
}

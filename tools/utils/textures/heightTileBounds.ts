import type { HeightTile } from '../../../src/@types/scene/HeightTile';

/**
 * heightTileBounds — a tile's `subtreeMin/MaxM`: the range of the FINEST data
 * anywhere under it, not just of its own posts.
 *
 * Three contributors, unioned: this tile's posts, every child already on disk
 * (whose own header already bounds ITS subtree, so the union is recursive for
 * free), and the source's native-resolution range over the tile's box — which
 * catches a peak the lattice steps straight over. A bound may be wide; it may
 * never be narrow, because everything downstream treats it as an envelope.
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

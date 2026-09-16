import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';

/**
 * deepestResidentAncestor — climb `tile`'s OWN ancestor chain, deepest first,
 * to the first level `lookup` resolves. `minLevel` is a STRICT floor: it is
 * never probed, since the base level is whole-globe and resolving there would
 * make every leaf's climb succeed. `maxLevelDelta` caps callers whose payload
 * degenerates past some depth; the climb is otherwise floor-bound only.
 */
export function deepestResidentAncestor<T>(
  tile: SurfaceTileId,
  minLevel: number,
  lookup: (tile: SurfaceTileId) => T | null,
  maxLevelDelta = Infinity,
): { readonly found: T; readonly levelDelta: number } | null {
  const { product, z, x, y } = tile;
  for (let levelDelta = 0; levelDelta <= maxLevelDelta && z - levelDelta > minLevel; levelDelta++) {
    const found = lookup({ product, z: z - levelDelta, x: x >> levelDelta, y: y >> levelDelta });
    if (found !== null) return { found, levelDelta };
  }
  return null;
}

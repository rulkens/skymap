import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import { HEIGHT_POSTS_PER_TILE } from '../../data/scene/heightTileFormat';

/**
 * resolveHeightLattice — the height lattice a leaf samples (R14): the deepest
 * resident tile in its OWN ancestor chain, flattened to the leaf's sub-rect in
 * posts. Strict decimation (R1) makes that sub-rect match the ancestor's own.
 * Capped at `levelDelta` 7 (`cells` hits 0 past it) — dropped, not degenerate.
 */
export function resolveHeightLattice(input: {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** The walk's floor: nothing at or shallower than this is atlas-resident. */
  readonly baseLevel: number;
  /** Where the climb STARTS. `balanceSurfaceCut` raises it to step one leaf's
   *  lattice coarser without touching the leaf itself. */
  readonly minLevelDelta: number;
  readonly residentSlot: (tile: SurfaceTileId) => { readonly slot: number } | null;
}): SurfaceCutTile['height'] | null {
  const { z, x, y, baseLevel, minLevelDelta, residentSlot } = input;

  const MAX_LEVEL_DELTA = 7;
  for (
    let levelDelta = Math.max(0, minLevelDelta);
    levelDelta <= MAX_LEVEL_DELTA && z - levelDelta > baseLevel;
    levelDelta++
  ) {
    const ancX = x >> levelDelta;
    const ancY = y >> levelDelta;
    const found = residentSlot({ product: 'height', z: z - levelDelta, x: ancX, y: ancY });
    if (found === null) continue;
    const span = 1 << levelDelta;
    // Posts, not cells: the leaf's block of the ancestor's 128 cells. Rows are
    // the atlas's own north-to-south order, as tile `y` already is — no flip.
    const cells = (HEIGHT_POSTS_PER_TILE - 1) >> levelDelta;
    return {
      slot: found.slot,
      levelDelta,
      originPosts: [(x - ancX * span) * cells, (y - ancY * span) * cells],
    };
  }
  return null;
}

/**
 * resizeStarPools — re-installs every loaded survey catalog's chunk pool at a
 * new size from the octree the slot already holds, with no refetch. Returns the
 * first failure's message (a pool past its cap names the largest count that
 * fits) or null; a failed source keeps its old pool.
 */
import { installOctreePool } from '../../../services/octree/installOctreePool';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

export function resizeStarPools(
  runtime: Pick<StarCatalogRuntime, 'catalogs' | 'poolHost'>,
  slotsOverride: number | null,
): string | null {
  let error: string | null = null;
  for (const [source, slot] of runtime.catalogs) {
    const octree = slot.current();
    const req = slot.lastRequest();
    if (octree === null || req === null) continue;
    try {
      installOctreePool(runtime.poolHost, source, octree, req.tier, slotsOverride);
    } catch (err) {
      error ??= (err as Error).message;
    }
  }
  return error;
}

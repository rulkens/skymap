import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { ResidentLookupResult } from '../@types/ResidentLookupResult';
import type { StandaloneProduct } from '../@types/StandaloneProduct';
import type { StandaloneRect } from '../@types/StandaloneRect';
import { flattenAtlasRect } from './flattenAtlasRect';

/**
 * resolveStandaloneRect — a leaf's share of one standalone product (one that
 * never gates the cut: the global texture stands in when it is null). The walk
 * starts at `min(z, maxLevel)`, since such a product can bake shallower than
 * the cut, and climbs strictly above `baseLevel`. An empty tile ends it with
 * `'empty'` even over a resident ancestor: the bake said "nothing here", and an
 * ancestor's coarser texels would contradict it.
 */
export function resolveStandaloneRect(input: {
  readonly product: StandaloneProduct;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** The deepest max of the product's request bands; below 0 means it has none. */
  readonly maxLevel: number;
  readonly baseLevel: number;
  readonly residentSlot: (tile: SurfaceTileId) => ResidentLookupResult;
  readonly isEmpty: (tile: SurfaceTileId) => boolean;
}): StandaloneRect {
  const { product, z, x, y, maxLevel, baseLevel, residentSlot, isEmpty } = input;
  if (maxLevel < 0) return null;
  const top = Math.min(z, maxLevel);
  const startDelta = z - top;
  for (let climbed = 0; top - climbed > baseLevel; climbed++) {
    const shift = startDelta + climbed;
    const tile: SurfaceTileId = { product, z: top - climbed, x: x >> shift, y: y >> shift };
    if (isEmpty(tile)) return 'empty';
    const found = residentSlot(tile);
    if (found !== null) return flattenAtlasRect(found, shift, x, y);
  }
  return null;
}

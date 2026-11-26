import type { SurfaceTileManifestBand } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { HORIZON_GLOBE_LEVELS } from '../data/horizonGlobeLevels';
import { HORIZON_SUB_TILE_LEVELS } from '../data/horizonSubTiles';

// Coarser horizon would feed nothing: the planner requests from the globe's level + 1 (z3) down.
const LOWEST_LEVEL = Math.min(...HORIZON_GLOBE_LEVELS.map(({ level }) => level));

/** horizonLevelsOfBand — the levels a height band's horizon tiles exist at: two above its
 *  heights, stopping at the lowest level a globe image repacks from. */
export function horizonLevelsOfBand(
  band: Pick<SurfaceTileManifestBand, 'min' | 'max'>,
): Pick<SurfaceTileManifestBand, 'min' | 'max'> {
  return {
    min: Math.max(LOWEST_LEVEL, band.min - HORIZON_SUB_TILE_LEVELS),
    max: band.max - HORIZON_SUB_TILE_LEVELS,
  };
}

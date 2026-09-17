import type { SurfaceTileId } from '../data/SurfaceTileId';
import type { HeightTileHeader } from './HeightTileHeader';

/** ResidentHeightLookup — probes one tile's atlas residency for `terrainHeightM`'s
 *  ancestor climb; `null` means "not resident", not "not yet fetched". */
export type ResidentHeightLookup = (tile: SurfaceTileId) => HeightTileHeader | null;

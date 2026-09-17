import type { SurfaceTileId } from '../data/SurfaceTileId';
import type { HeightTileHeader } from './HeightTileHeader';

/** ResidentHeightLookup — probes one tile's atlas residency for `terrainHeightM`'s
 *  ancestor climb; `null` means "not resident", not "not yet fetched". Narrowed to
 *  the one field the climb samples: residency keeps no `geometricResidualM`, and
 *  asking for the whole header forces a caller to invent a figure for it. */
export type ResidentHeightLookup = (
  tile: SurfaceTileId,
) => Pick<HeightTileHeader, 'gridCodes'> | null;

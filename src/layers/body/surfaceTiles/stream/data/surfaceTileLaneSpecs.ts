/**
 * SURFACE_TILE_LANE_SPECS — each product's atlas and fetcher, the one table
 * `surfaceTileStream` builds its lanes from. Height's geometry is compiled
 * constants, not manifest fields (spec §5.2), so it never depends on the bake.
 */

import type { SurfaceTileProduct } from '../../format/@types/SurfaceTileProduct';
import type { SurfaceTileLaneSpec } from '../@types/SurfaceTileLaneSpec';
import {
  SURFACE_TILE_ATLAS_SIDE,
  SURFACE_TILE_PX,
  HEIGHT_TILE_ATLAS_SIDE,
  NIGHT_TILE_ATLAS_SIDE,
} from '../../format/data/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../format/data/heightTileFormat';
import { fetchSurfaceTileBitmap } from '../load/fetchSurfaceTileBitmap';
import { fetchHeightTile } from '../load/fetchHeightTile';

const fetchImageryPayload: SurfaceTileLaneSpec['fetch'] = async (tile, source) => {
  const bitmap = await fetchSurfaceTileBitmap(tile, source);
  return bitmap === null ? null : { bitmap, subtreeRangeM: null, gridCodes: null };
};

export const SURFACE_TILE_LANE_SPECS: Readonly<Record<SurfaceTileProduct, SurfaceTileLaneSpec>> = {
  albedo: {
    label: 'surface-tiles-albedo',
    atlasSide: SURFACE_TILE_ATLAS_SIDE,
    slotSide: SURFACE_TILE_PX,
    format: 'rgba8unorm-srgb',
    fetch: fetchImageryPayload,
  },
  height: {
    label: 'surface-tiles-height',
    atlasSide: HEIGHT_TILE_ATLAS_SIDE,
    slotSide: HEIGHT_POSTS_PER_TILE,
    // Terrain-RGB codes the shader decodes (`lattice.wesl`'s `postHeightM`),
    // so never `-srgb`: the bytes are not colour.
    format: 'rgba8unorm',
    fetch: async (tile, source) => {
      const image = await fetchHeightTile(tile, source);
      if (image === null) return null;
      return {
        bitmap: image.bitmap,
        subtreeRangeM: [image.subtreeMinM, image.subtreeMaxM],
        gridCodes: image.gridCodes,
      };
    },
  },
  night: {
    label: 'surface-tiles-night',
    atlasSide: NIGHT_TILE_ATLAS_SIDE,
    slotSide: SURFACE_TILE_PX,
    format: 'rgba8unorm-srgb',
    fetch: fetchImageryPayload,
  },
};

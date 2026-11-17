import { SURFACE_TILE_OVERLAY_ROWS } from '../../surfaceTiles/debug/data/surfaceTileOverlayRows';
import type { SurfaceTileOverlayKey } from '../../surfaceTiles/debug/@types/SurfaceTileOverlayKey';
import type { SurfaceTileDebugSettings } from '../../@types/SurfaceTileDebugSettings';

export const initialState: SurfaceTileDebugSettings = {
  // Seeded from the rows, so a new row can't ship unseeded.
  overlays: Object.fromEntries(SURFACE_TILE_OVERLAY_ROWS.map((row) => [row.key, false])) as Record<
    SurfaceTileOverlayKey,
    boolean
  >,
};

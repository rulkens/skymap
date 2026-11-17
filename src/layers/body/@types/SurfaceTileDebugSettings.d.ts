import type { SurfaceTileOverlayKey } from '../surfaceTiles/debug/@types/SurfaceTileOverlayKey';

export type SurfaceTileDebugSettings = {
  overlays: Record<SurfaceTileOverlayKey, boolean>;
};

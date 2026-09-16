/**
 * SurfaceTileSpec — one body's entry in `SURFACE_TILE_REGISTRY`: everything
 * `surfaceTileSubsystem` needs to know about a body BEFORE its manifest has
 * ever been fetched. Membership in the registry IS the "this body tiles"
 * predicate — there is no separate boolean to drift out of sync with it.
 */
import type { SurfaceEffect } from './SurfaceEffect';
import type { SurfaceTileShading } from './SurfaceTileShading';

export type SurfaceTileSpec = {
  /** Folder under `data/images/` holding `manifest.json` — e.g. `earth-tiles`. */
  readonly manifestKey: string;
  /** Fragment variant selector. Order-insensitive. */
  readonly effects: readonly SurfaceEffect[];
  readonly shading: SurfaceTileShading;
};

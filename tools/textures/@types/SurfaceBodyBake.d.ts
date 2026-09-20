import type { SurfaceBakeBand } from './SurfaceBakeBand';

/** One body's entry in `SURFACE_BODY_BAKES` — what `--body` selects. `bands`
 *  is a function, not a value, so a body's raw-data reads happen only when
 *  that body is actually baked (Mars's DEMs are not touched by an Earth run). */
export type SurfaceBodyBake = {
  /** `SURFACE_TILE_REGISTRY[bodyId].manifestKey` — read, never retyped. */
  readonly tileRoot: string;
  /** `${tileRoot}/vN` — bump on any pixel change (see `earthSurfaceBake`'s
   *  own doc for why a version is new keys, never reused ones). */
  readonly tilePrefix: string;
  readonly bands: (opts: { dev: boolean }) => Promise<readonly SurfaceBakeBand[]>;
};

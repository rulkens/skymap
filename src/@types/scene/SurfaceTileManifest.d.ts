/**
 * SurfaceTileManifest — what the bake wrote, read once by the runtime before
 * requesting a tile: tile edge and the flat band list every product's
 * planner filters (§ `SurfaceTileManifestBand.builtFrom`). The planner
 * clamps against `tilePx` and a band's `[min, max]` — a level never baked is
 * a sustained 404 storm. A fetched JSON, not codegen: the feature engages
 * only on close approach, so one small JSON costs nothing, and re-baking is
 * then a data change, not a deploy. `bands` (not `Partial<Record<Product,
 * …>>`) because one geographic box bakes both products together — see
 * `SurfaceTileManifestBand`'s header for why splitting by product would
 * un-pair them.
 */

import type { SurfaceTileManifestBand } from './SurfaceTileManifestBand';

export type SurfaceTileManifest = {
  /**
   * Key prefix the tiles hang off, e.g. `earth-tiles/v8`. Versioned, so a
   * re-bake writes new keys: the old ones keep serving whatever the CDN
   * already cached until this pointer flips, instead of a new manifest
   * naming levels that the edge is still answering with stale pixels.
   */
  readonly prefix: string;
  readonly tilePx: number;
  readonly bands: readonly SurfaceTileManifestBand[];
};

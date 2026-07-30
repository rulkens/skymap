/**
 * EarthTileManifest — what the bake wrote, read once by the runtime before
 * requesting a tile: tile edge, per-kind bake depth, and source imagery.
 * The planner clamps against the first two — a level never baked is a
 * sustained 404 storm. A fetched JSON, not codegen: the feature engages
 * only on close approach, so one small JSON costs nothing, and re-baking
 * is then a data change, not a deploy. `levels`/`builtFrom` are `Partial`,
 * not total: a surface-only bake has no `normal` entry, and a total
 * `Record` would force one to be invented.
 */

import type { EarthTileKind } from '../data/EarthTileKind';

export type EarthTileManifest = {
  /**
   * Key prefix the tiles hang off, e.g. `earth-tiles/v1`. Versioned, so a
   * re-bake writes new keys: the old ones keep serving whatever the CDN
   * already cached until this pointer flips, instead of a new manifest
   * naming levels that the edge is still answering with stale pixels.
   */
  readonly prefix: string;
  readonly tilePx: number;
  readonly levels: Partial<Record<EarthTileKind, { readonly min: number; readonly max: number }>>;
  /** Source id + attribution + vintage, so a stale or mis-licensed bake is diagnosable. */
  readonly builtFrom: Partial<Record<EarthTileKind, string>>;
};

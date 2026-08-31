/**
 * EarthTileManifest — what the bake wrote, read once by the runtime before
 * requesting a tile: tile edge, per-kind bake depth, and source imagery.
 * The planner clamps against the first two — a level never baked is a
 * sustained 404 storm. A fetched JSON, not codegen: the feature engages
 * only on close approach, so one small JSON costs nothing, and re-baking
 * is then a data change, not a deploy. `levels` is `Partial`, not total:
 * a surface-only bake has no `normal` entry, and a total `Record` would
 * force one to be invented. Each kind's value is a list of bands rather
 * than one scalar range — several imagery sources can share a kind at
 * different geographic footprints and depths (EOX deep tiles over BMNG).
 */

import type { EarthTileKind } from '../data/EarthTileKind';
import type { EarthTileProvenance } from './EarthTileProvenance';
import type { LonLatBounds } from './LonLatBounds';

export type EarthTileManifest = {
  /**
   * Key prefix the tiles hang off, e.g. `earth-tiles/v3`. Versioned, so a
   * re-bake writes new keys: the old ones keep serving whatever the CDN
   * already cached until this pointer flips, instead of a new manifest
   * naming levels that the edge is still answering with stale pixels.
   */
  readonly prefix: string;
  readonly tilePx: number;
  readonly levels: Partial<
    Record<
      EarthTileKind,
      ReadonlyArray<{
        readonly bounds: LonLatBounds;
        readonly min: number;
        readonly max: number;
        readonly builtFrom: EarthTileProvenance;
      }>
    >
  >;
};

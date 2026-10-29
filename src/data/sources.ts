/**
 * `SOURCE_REGISTRY`, keyed by `Source` code (`./source`); `SourceEntry.d.ts` lists the `type`
 * kinds. Each row lives under its Layer's `sources/` and folds in through that Layer's rows array.
 */

import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SourceType } from '../@types/data/SourceType';
import type { Tier } from '../@types/data/Tier';

import { GALAXY_CATALOG_SOURCE_ROWS } from '../layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { STRUCTURE_SOURCE_ROWS } from '../layers/structure/sources/structureSourceRows';
import { sourceRecordOf } from '../utils/data/sourceRecordOf';
import { FILAMENTS_SOURCE_ROWS } from '../layers/cosmicWebFilaments/sources/filamentsSourceRows';
import { CONSTELLATIONS_SOURCE_ROWS } from '../layers/constellations/sources/constellationsSourceRows';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import { MILKY_WAY_SOURCE_ROWS } from '../layers/milkyWay/sources/milkyWaySourceRows';
import { FLOW_SOURCE_ROWS } from '../layers/flow/sources/flowSourceRows';
import { BODY_SOURCE_ROWS } from '../layers/body/sources/bodySourceRows';
import { MISSIONS_SOURCE_ROWS } from '../layers/missions/sources/missionsSourceRows';
import { ZONE_OF_AVOIDANCE_SOURCE_ROWS } from '../layers/zoneOfAvoidance/sources/zoneOfAvoidanceSourceRows';
import { STAR_CATALOG_SOURCE_ROWS } from '../layers/starCatalog/sources/starCatalogSourceRows';
import { BLACK_HOLE_SOURCE_ROWS } from '../layers/blackHoles/sources/blackHoleSourceRows';

export { Source } from './source';

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * `as const satisfies` keeps each entry's literal `type`, so `SOURCE_REGISTRY[Source.SDSS]`
 * narrows without casts. `maxDistMpc` is a display limit (H₀ ≈ 70 km/s/Mpc), not a cut;
 * `bandLabels` names what each `magU/G/R/I/Z` slot really carries (`'—'` = empty). Integer keys
 * iterate ascending, so `SOURCE_ENTRIES` / `SOURCE_IDS` and the Labels panel follow code value.
 */
export const SOURCE_REGISTRY = {
  ...sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS),
  ...sourceRecordOf(STAR_CATALOG_SOURCE_ROWS),
  ...sourceRecordOf(FILAMENTS_SOURCE_ROWS),
  ...sourceRecordOf(FLOW_SOURCE_ROWS),
  ...sourceRecordOf(MILKY_WAY_SOURCE_ROWS),
  ...sourceRecordOf(ZONE_OF_AVOIDANCE_SOURCE_ROWS),
  ...sourceRecordOf(CONSTELLATIONS_SOURCE_ROWS),
  ...sourceRecordOf(COSMIC_WEB_DENSITY_SOURCE_ROWS),
  ...sourceRecordOf(BLACK_HOLE_SOURCE_ROWS),
  ...sourceRecordOf(BODY_SOURCE_ROWS),
  ...sourceRecordOf(MISSIONS_SOURCE_ROWS),
  ...sourceRecordOf(STRUCTURE_SOURCE_ROWS),
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;

// ─── Famous-galaxy high-res LOD ─────────────────────────────────────────────

/**
 * `texture_2d_array` holding Famous-galaxy thumbnails at curator resolution. Cost is
 * `N * layerSide² * 4 bytes`: 32 MB at 1024² (medium/large), 8 MB at 512² (small, downsampled at
 * decode). `docs/adrs/0002-tiered-thumbnail-textures.md` and the fade-band math assume these.
 */
export const HI_RES_LAYER_COUNT = 8 as const;

export const HI_RES_LAYER_SIDE_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 512,
  medium: 1024,
  large: 1024,
} as const;

// ─── Iteration order ────────────────────────────────────────────────────────

/** Galaxy catalog codes, `GALAXY_CATALOG_SOURCE_ROWS` order — see that file. */
export const GALAXY_CATALOG_SOURCES: readonly (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][0][] =
  GALAXY_CATALOG_SOURCE_ROWS.map(([code]) => code);

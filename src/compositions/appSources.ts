/**
 * `APP_SOURCE_REGISTRY`, keyed by `Source` code (`data/source`); `SourceEntry.d.ts` lists the `type`
 * kinds. Rows import straight from each Layer's `sources/`, never `layer.ts` or `APP_COMPOSITION`
 * (the tuple would reopen the circular alias and module-init cycles). `as const satisfies` keeps
 * each entry's literal `type`, so `APP_SOURCE_REGISTRY[Source.SDSS]` narrows without casts.
 * `maxDistMpc` is a display limit (H₀ ≈ 70 km/s/Mpc), not a cut. Integer keys iterate ascending,
 * so `SOURCE_ENTRIES` / `SOURCE_IDS` and the Labels panel follow code value.
 * `bandLabels` names what each `magU/G/R/I/Z` slot really carries, `'—'` = empty.
 */

import type { SourceEntry } from '../@types/data/SourceEntry';
import type { SourceType } from '../@types/data/SourceType';

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
import { SATELLITES_SOURCE_ROWS } from '../layers/satellites/sources/satellitesSourceRows';
import { ZONE_OF_AVOIDANCE_SOURCE_ROWS } from '../layers/zoneOfAvoidance/sources/zoneOfAvoidanceSourceRows';
import { STAR_CATALOG_SOURCE_ROWS } from '../layers/starCatalog/sources/starCatalogSourceRows';
import { BLACK_HOLE_SOURCE_ROWS } from '../layers/blackHoles/sources/blackHoleSourceRows';

export const APP_SOURCE_REGISTRY = {
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
  ...sourceRecordOf(SATELLITES_SOURCE_ROWS),
  ...sourceRecordOf(STRUCTURE_SOURCE_ROWS),
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;

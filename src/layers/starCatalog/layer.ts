/**
 * The starCatalog Layer: the survey Gaia bin plus the three seeded catalogs
 * (Sun, S-stars, famous stars), their four renderers, the octree cut, the
 * Stars settings section, and every contribution they make to a frame. Pass
 * order matches `FRAME_ORDER` (`frameSections.ts`), not this array's own
 * ordering rules.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { starCatalogLayerSettings } from './state/slices';
import { starCatalogVisibility } from './visibility';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { starCatalogPlanner } from './frame';
import { starCatalogAssetRows } from './load/starCatalogAssetRows';
import { starCatalogSourceCounts } from './load/starCatalogSourceCounts';
import { starCutCompute } from './computes/starCutCompute';
import { starAggregatesPass } from './passes/starAggregatesPass';
import { starPointsPass } from './passes/starPointsPass';
import { starCatalogPass } from './passes/starCatalogPass';
import { starAggregateUpsamplePass } from './passes/starAggregateUpsamplePass';
import { starSpheresPass } from './passes/starSpheresPass';
import { fieldStarSpherePass } from './passes/fieldStarSpherePass';
import { starCatalogSelectionRow } from './present/starCatalogSelectionRow';
import { produceStarCaptions } from './present/produceStarCaptions';
import { STAR_AGGREGATES_TARGET } from './render/starAggregatesTarget';
import { S_STAR_ORBITAL_ELEMENTS } from '../../data/bodies/sStarOrbitalElements';
import StarsSectionContainer from './ui/StarsSectionContainer';
import StarCatalogTuningSectionContainer from './ui/StarCatalogTuningSectionContainer';
import type { StarCatalogFacts } from './@types/StarCatalogFacts';

export const starCatalogLayer = defineLayer({
  name: 'starCatalog',
  settings: starCatalogLayerSettings,
  visibility: starCatalogVisibility,
  sources: STAR_CATALOG_SOURCE_ROWS,
  facts: { famousStarsMeta: [], chunkSlotsError: null } as StarCatalogFacts,
  targets: [STAR_AGGREGATES_TARGET],
  create,
  destroy,
  passes: (runtime) => [
    starAggregatesPass(runtime),
    starPointsPass(runtime),
    starCatalogPass(runtime),
    starAggregateUpsamplePass(runtime),
    starSpheresPass(runtime),
    fieldStarSpherePass(runtime),
  ],
  computes: (runtime) => [starCutCompute(runtime)],
  assets: starCatalogAssetRows,
  sourceCounts: starCatalogSourceCounts,
  guides: () => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'starCaptions',
        label: 'starCatalog',
        produceLabels: produceStarCaptions(),
      },
    ],
    orbitTrails: { show: 'sStarTrails', rows: S_STAR_ORBITAL_ELEMENTS },
  }),
  selection: (runtime) => [starCatalogSelectionRow(runtime)],
  planners: (runtime) => [starCatalogPlanner(runtime)],
  ui: [
    { slot: 'main', content: StarsSectionContainer },
    { slot: 'debug', content: StarCatalogTuningSectionContainer },
    { slot: 'labelsAndGuides', content: { toggle: 'sStarTrails', label: 'S-star trails' } },
  ],
});

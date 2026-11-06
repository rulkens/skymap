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
import { starCatalogAssetRows } from './survey/load/starCatalogAssetRows';
import { starCatalogSourceCounts } from './survey/load/starCatalogSourceCounts';
import { starCutCompute } from './octreeCut/computes/starCutCompute';
import { starAggregatesPass } from './survey/passes/starAggregatesPass';
import { starPointsPass } from './seededStars/passes/starPointsPass';
import { starCatalogPass } from './survey/passes/starCatalogPass';
import { starAggregateUpsamplePass } from './survey/passes/starAggregateUpsamplePass';
import { starSpheresPass } from './resolvedStars/passes/starSpheresPass';
import { fieldStarSpherePass } from './resolvedStars/passes/fieldStarSpherePass';
import { starCatalogSelectionRow } from './selection/present/starCatalogSelectionRow';
import { starCatalogSelectionKinds } from './selection/kinds';
import { starSearch } from './selection/present/starSearch';
import { produceStarCaptions } from './captions/present/produceStarCaptions';
import { STAR_AGGREGATES_TARGET } from './survey/render/starAggregatesTarget';
import { S_STAR_ORBITAL_ELEMENTS } from '../../data/bodies/sStarOrbitalElements';
import StarsSectionContainer from './controls/ui/StarsSectionContainer';
import StarCatalogTuningSectionContainer from './controls/ui/StarCatalogTuningSectionContainer';
import StarDetailCardContainer from './card/ui/StarDetailCardContainer';
import CompactStarCard from './card/ui/CompactStarCard/CompactStarCard';
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
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'starCaptions',
        label: 'starCatalog',
        produceLabels: produceStarCaptions(runtime),
      },
    ],
    orbitTrails: { show: 'sStarTrails', rows: S_STAR_ORBITAL_ELEMENTS },
  }),
  selection: {
    kinds: starCatalogSelectionKinds,
    rows: (runtime) => [starCatalogSelectionRow(runtime)],
  },
  search: () => starSearch(),
  planners: (runtime) => [starCatalogPlanner(runtime)],
  ui: [
    { slot: 'main', content: StarsSectionContainer, title: 'Stars' },
    { slot: 'debug', content: StarCatalogTuningSectionContainer },
    { slot: 'labelsAndGuides', content: { toggle: 'sStarTrails', label: 'S-star trails' } },
    {
      slot: 'detailCard',
      content: { type: 'starCatalog', Detail: StarDetailCardContainer, Compact: CompactStarCard },
    },
  ],
});

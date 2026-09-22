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
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { frame } from './frame';
import { starCatalogAssetRows } from './load/starCatalogAssetRows';
import { starAggregatesPass } from './passes/starAggregatesPass';
import { starPointsPass } from './passes/starPointsPass';
import { starCatalogPass } from './passes/starCatalogPass';
import { starAggregateUpsamplePass } from './passes/starAggregateUpsamplePass';
import { starSpheresPass } from './passes/starSpheresPass';
import { fieldStarSpherePass } from './passes/fieldStarSpherePass';
import { starCatalogFadeRows } from './present/starCatalogFadeRows';
import { starCatalogSelectionRow } from './present/starCatalogSelectionRow';
import { produceStarCaptions } from './present/produceStarCaptions';
import { STAR_AGGREGATES_TARGET } from './render/starAggregatesTarget';
import { S_STAR_ORBITAL_ELEMENTS } from '../../data/bodies/sStarOrbitalElements';
import StarsSectionContainer from './ui/StarsSectionContainer';
import type { StarCatalogFacts } from './@types/StarCatalogFacts';

export const starCatalogLayer = defineLayer({
  name: 'starCatalog',
  settings: starCatalogLayerSettings,
  sources: STAR_CATALOG_SOURCE_ROWS,
  facts: { famousStarsMeta: [] } as StarCatalogFacts,
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
  assets: starCatalogAssetRows,
  fades: starCatalogFadeRows,
  guides: () => ({
    screenLabels: [{ slab: NEAR0, id: 'starCaptions', produceLabels: produceStarCaptions() }],
    orbitTrails: S_STAR_ORBITAL_ELEMENTS,
  }),
  selection: (runtime) => [starCatalogSelectionRow(runtime)],
  frame,
  ui: [{ slot: 'main', content: StarsSectionContainer }],
});

/**
 * The structure Layer: the extended-structure categories of both scales (cosmic
 * on COSMO, Milky Way on NEAR0) — the record store and its bulk catalog, the
 * per-view marker planner, one ring/halo pass and one label producer per slab,
 * the ring and label fade rows, the selection row, the Structures settings
 * section and the InfoCard detail cards.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';
import { structureLayerSettings } from './state/slices';
import { STRUCTURE_SOURCE_ROWS } from './sources/structureSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { structureMarkersPlanner } from './frame';
import { structureAssetRows } from './load/structureAssetRows';
import { structureMarkersCosmoPass } from './passes/structureMarkersCosmoPass';
import { structureMarkersNearPass } from './passes/structureMarkersNearPass';
import { structureFadeRows } from './present/structureFadeRows';
import { produceStructureLabels } from './present/produceStructureLabels';
import { structureSelectionRow } from './present/structureSelectionRow';
import StructuresSectionContainer from './ui/StructuresSectionContainer';
import StructureDetailCardContainer from './ui/StructureDetailCardContainer';
import CompactStructureCard from './ui/CompactStructureCard/CompactStructureCard';

export const structureLayer = defineLayer({
  name: 'structure',
  settings: structureLayerSettings,
  sources: STRUCTURE_SOURCE_ROWS,
  create,
  destroy,
  // Wrapped, not passed bare: the row's narrow `Pick` parameter would otherwise
  // become `defineLayer`'s inferred Runtime.
  assets: (runtime) => structureAssetRows(runtime),
  passes: (runtime) => [structureMarkersCosmoPass(runtime), structureMarkersNearPass(runtime)],
  planners: (runtime) => [structureMarkersPlanner(runtime)],
  guides: (runtime) => ({
    screenLabels: [
      {
        id: 'structureLabelsCosmo',
        slab: COSMO,
        produceLabels: produceStructureLabels(runtime.store, 'cosmic'),
      },
      {
        id: 'structureLabelsNear',
        slab: NEAR0,
        produceLabels: produceStructureLabels(runtime.store, 'milkyWay'),
      },
    ],
  }),
  fades: structureFadeRows,
  selection: (runtime) => [structureSelectionRow(runtime.store)],
  ui: [
    { slot: 'main', content: StructuresSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'structure',
        // A store container: the "N galaxies" figure is a live-computed fact,
        // not part of every arm's shared props (store-boundary rule).
        Detail: StructureDetailCardContainer,
        Compact: CompactStructureCard,
      },
    },
  ],
});

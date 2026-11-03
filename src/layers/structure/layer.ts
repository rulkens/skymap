/**
 * The structure Layer: the extended-structure categories of both scales (cosmic
 * on COSMO, Milky Way on NEAR0) — the record store and its bulk catalog, the
 * per-view marker planner, one ring/halo pass and one label producer per slab,
 * the ring and label entries, the selection row, the Structures settings
 * section and the InfoCard detail cards.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';
import { structureLayerSettings } from './state/slices';
import { structureVisibility } from './visibility';
import { STRUCTURE_SOURCE_ROWS } from './sources/structureSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { structureMarkersPlanner } from './frame';
import { structureAssetRows } from './catalog/load/structureAssetRows';
import { structureMarkersCosmoPass } from './markers/passes/structureMarkersCosmoPass';
import { structureMarkersNearPass } from './markers/passes/structureMarkersNearPass';
import { produceStructureLabels } from './markers/present/produceStructureLabels';
import { structureSelectionRow } from './picking/present/structureSelectionRow';
import StructuresSectionContainer from './controls/ui/StructuresSectionContainer';
import { STRUCTURES_SECTION_TITLE } from './controls/data/structuresSectionTitle';
import StructureDetailCardContainer from './cards/ui/StructureDetailCardContainer';
import CompactStructureCard from './cards/ui/CompactStructureCard/CompactStructureCard';
import type { StructureFacts } from './@types/StructureFacts';

export const structureLayer = defineLayer({
  name: 'structure',
  settings: structureLayerSettings,
  visibility: structureVisibility,
  sources: STRUCTURE_SOURCE_ROWS,
  facts: { counts: {}, searchList: [], bulk: 'idle' } as StructureFacts,
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
        label: 'structure',
        produceLabels: produceStructureLabels(runtime.store, 'cosmic'),
      },
      {
        id: 'structureLabelsNear',
        slab: NEAR0,
        label: 'structure',
        produceLabels: produceStructureLabels(runtime.store, 'milkyWay'),
      },
    ],
  }),
  selection: (runtime) => [structureSelectionRow(runtime.store)],
  ui: [
    { slot: 'main', content: StructuresSectionContainer, title: STRUCTURES_SECTION_TITLE },
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

/**
 * The galaxy-catalog Layer: nine point sources, their renderers, the thumbnail
 * LOD chain, the Galaxies settings section, the galaxy InfoCard, the
 * provenance debug section, `watchPaletteWakeSaga` (its own
 * demand trigger's wake) and every contribution they make to a frame. No
 * `targets`.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO } from '../../services/engine/frame/slabs';
import { galaxyCatalogLayerSettings } from './state/slices';
import { galaxyCatalogVisibility } from './visibility';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { galaxyCatalogPlanner } from './frame';
import { galaxyCatalogAssetRows } from './records/load/galaxyCatalogAssetRows';
import { galaxyCatalogSourceCounts } from './records/load/galaxyCatalogSourceCounts';
import { galaxyPointSpritesPass } from './pointSprites/passes/galaxyPointSpritesPass';
import { galaxyAggregatesPass } from './octree/passes/galaxyAggregatesPass';
import { galaxyCutCompute } from './octree/computes/galaxyCutCompute';
import { proceduralDisksPass } from './disks/procedural/passes/proceduralDisksPass';
import { texturedDisksPass } from './disks/textured/passes/texturedDisksPass';
import { galaxyCatalogSelectionRow } from './selection/present/galaxyCatalogSelectionRow';
import { produceFamousGalaxyLabels } from './famousGalaxies/present/produceFamousGalaxyLabels';
import { watchPaletteWakeSaga } from './aliases/sagas/watchPaletteWakeSaga';
import GalaxiesSectionContainer from './controls/ui/GalaxiesSectionContainer';
import GalaxyBlobTuningSectionContainer from './controls/ui/GalaxyBlobTuningSectionContainer';
import GalaxyDetailCard from './card/ui/GalaxyDetailCard/GalaxyDetailCard';
import CompactCard from './card/ui/CompactCard/CompactCard';
import GalaxyProvenanceSectionContainer from './provenance/ui/GalaxyProvenanceSectionContainer';
import type { GalaxyCatalogFacts } from './@types/GalaxyCatalogFacts';

export const galaxyCatalogLayer = defineLayer({
  name: 'galaxyCatalog',
  settings: galaxyCatalogLayerSettings,
  visibility: galaxyCatalogVisibility,
  sources: GALAXY_CATALOG_SOURCE_ROWS,
  facts: {
    famousMeta: [],
    provenanceCounts: {},
    aliasIndex: [],
    structureMemberCount: null,
  } as GalaxyCatalogFacts,
  create,
  destroy,
  passes: (runtime) => [
    galaxyPointSpritesPass(runtime),
    galaxyAggregatesPass(runtime),
    proceduralDisksPass(runtime),
    texturedDisksPass(runtime),
  ],
  computes: (runtime) => [galaxyCutCompute(runtime)],
  assets: galaxyCatalogAssetRows,
  sagas: [watchPaletteWakeSaga],
  sourceCounts: galaxyCatalogSourceCounts,
  guides: (runtime) => ({
    screenLabels: [
      {
        id: 'famousLabels',
        slab: COSMO,
        label: 'famousGalaxy',
        produceLabels: produceFamousGalaxyLabels(runtime),
      },
    ],
  }),
  selection: (runtime) => [galaxyCatalogSelectionRow(runtime)],
  planners: (runtime) => [galaxyCatalogPlanner(runtime)],
  ui: [
    { slot: 'main', content: GalaxiesSectionContainer, title: 'Galaxies' },
    { slot: 'debug', content: GalaxyProvenanceSectionContainer },
    {
      slot: 'detailCard',
      content: { type: 'galaxyCatalog', Detail: GalaxyDetailCard, Compact: CompactCard },
    },
    { slot: 'debug', content: GalaxyBlobTuningSectionContainer },
  ],
});

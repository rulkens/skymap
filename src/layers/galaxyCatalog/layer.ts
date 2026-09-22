/**
 * The galaxy-catalog Layer: nine point sources, their renderers, the thumbnail
 * LOD chain, the Galaxies settings section, `watchPaletteWakeSaga` (its own
 * demand trigger's wake) and every contribution they make to a frame. No
 * `targets`.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO } from '../../services/engine/frame/slabs';
import { galaxyCatalogLayerSettings } from './state/slices';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { galaxyCatalogPlanner } from './frame';
import { galaxyCatalogAssetRows } from './load/galaxyCatalogAssetRows';
import { galaxyPointSpritesPass } from './passes/galaxyPointSpritesPass';
import { proceduralDisksPass } from './passes/proceduralDisksPass';
import { texturedDisksPass } from './passes/texturedDisksPass';
import { galaxyCatalogFadeRows } from './present/galaxyCatalogFadeRows';
import { galaxyCatalogSelectionRow } from './present/galaxyCatalogSelectionRow';
import { produceFamousGalaxyLabels } from './present/produceFamousGalaxyLabels';
import { watchPaletteWakeSaga } from './sagas/watchPaletteWakeSaga';
import GalaxiesSectionContainer from './ui/GalaxiesSectionContainer';
import type { GalaxyCatalogFacts } from './@types/GalaxyCatalogFacts';

export const galaxyCatalogLayer = defineLayer({
  name: 'galaxyCatalog',
  settings: galaxyCatalogLayerSettings,
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
    proceduralDisksPass(runtime),
    texturedDisksPass(runtime),
  ],
  assets: galaxyCatalogAssetRows,
  sagas: [watchPaletteWakeSaga],
  fades: galaxyCatalogFadeRows,
  guides: (runtime) => ({
    screenLabels: [
      { id: 'famousLabels', slab: COSMO, produceLabels: produceFamousGalaxyLabels(runtime) },
    ],
  }),
  selection: (runtime) => [galaxyCatalogSelectionRow(runtime)],
  planners: (runtime) => [galaxyCatalogPlanner(runtime)],
  ui: [{ slot: 'main', content: GalaxiesSectionContainer }],
});

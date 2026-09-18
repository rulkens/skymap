/**
 * The galaxy-catalog Layer: nine point sources, their renderers, the thumbnail
 * LOD chain, the Galaxies settings section, `watchPaletteWakeSaga` (its own
 * demand trigger's wake) and every contribution they make to a frame. No
 * `targets`.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { galaxyCatalogLayerSettings } from './settings/galaxyCatalogLayerSettings';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { frame } from './frame';
import { galaxyCatalogAssetRows } from './load/galaxyCatalogAssetRows';
import { galaxyPointSpritesPass } from './passes/galaxyPointSpritesPass';
import { proceduralDisksPass } from './passes/proceduralDisksPass';
import { texturedDisksPass } from './passes/texturedDisksPass';
import { galaxyCatalogFadeRows } from './present/galaxyCatalogFadeRows';
import { galaxyCatalogSelectionRow } from './present/galaxyCatalogSelectionRow';
import { produceFamousGalaxyLabels } from './present/produceFamousGalaxyLabels';
import { watchPaletteWakeSaga } from './sagas/watchPaletteWakeSaga';
import GalaxiesSectionContainer from './ui/GalaxiesSectionContainer';
import type { GalaxyCatalogFacts } from './types/GalaxyCatalogFacts';

export const galaxyCatalogLayer = defineLayer({
  name: 'galaxyCatalog',
  // A fragment listed here may not also sit in `UNFORMED_SETTINGS_FRAGMENTS`:
  // the reducer-key uniqueness assert throws at import (Ruling 15).
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
  labels: (runtime) => [{ id: 'famousLabels', produceLabels: produceFamousGalaxyLabels(runtime) }],
  selection: (runtime) => [galaxyCatalogSelectionRow(runtime)],
  frame,
  ui: { settings: GalaxiesSectionContainer },
});

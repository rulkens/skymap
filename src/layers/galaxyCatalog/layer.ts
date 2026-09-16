/**
 * The galaxy-catalog Layer: nine point sources, their renderers, the thumbnail
 * LOD chain and every contribution they make to a frame. No `ui` yet (Ruling 8)
 * and no `targets`/`sagas`.
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
import { diskRadiusRingPass } from './passes/diskRadiusRingPass';
import { galaxyCatalogFadeRows } from './present/galaxyCatalogFadeRows';
import { galaxyCatalogSelectionRow } from './present/galaxyCatalogSelectionRow';
import { produceFamousGalaxyLabels } from './present/produceFamousGalaxyLabels';
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
    diskRadiusRingPass(runtime),
  ],
  assets: galaxyCatalogAssetRows,
  fades: galaxyCatalogFadeRows,
  labels: (runtime) => [{ id: 'famousLabels', produceLabels: produceFamousGalaxyLabels(runtime) }],
  selection: (runtime) => [galaxyCatalogSelectionRow(runtime)],
  frame,
});

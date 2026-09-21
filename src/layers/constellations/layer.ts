/**
 * The constellations Layer: the 88 classical asterisms drawn as true-3D stick
 * figures between their real member stars — one renderer, one pass, one asset
 * slot, one fade row, one source, and the figure-name captions.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { constellationsLayerSettings } from './state/slices';
import { CONSTELLATIONS_SOURCE_ROWS } from './sources/constellationsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { constellationsAssetRows } from './load/constellationsAssetRows';
import { constellationsPass } from './passes/constellationsPass';
import { constellationsFadeRows } from './present/constellationsFadeRows';
import { produceConstellationCaptions } from './present/produceConstellationCaptions';
import { constellationsSettingsRow } from './ui/constellationsSettingsRow';

export const constellationsLayer = defineLayer({
  name: 'constellations',
  // A fragment listed here may not also sit in `UNFORMED_SETTINGS_FRAGMENTS`:
  // the reducer-key uniqueness assert throws at import (Ruling 15).
  settings: constellationsLayerSettings,
  sources: CONSTELLATIONS_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [constellationsPass(runtime)],
  assets: constellationsAssetRows,
  fades: constellationsFadeRows,
  labels: (runtime) => ({
    screen: [
      // NEAR0, not COSMO: the figure anchors sit at parsec distances, inside
      // COSMO's fixed 0.01 Mpc near plane, so a COSMO-projected label could
      // never draw (full story in `constellationCaptions.ts`'s header).
      {
        slab: NEAR0,
        id: 'constellationCaptions',
        produceLabels: produceConstellationCaptions(runtime),
      },
    ],
  }),
  ui: [{ slot: 'labelsAndGuides', content: constellationsSettingsRow }],
});

/**
 * The constellations Layer: the 88 classical asterisms drawn as true-3D stick
 * figures between their real member stars — one renderer, one pass, one asset
 * slot, one source, and the figure-name captions, a show and a label entry.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { constellationsLayerSettings } from './state/slices';
import { constellationsVisibility } from './visibility';
import { CONSTELLATIONS_SOURCE_ROWS } from './sources/constellationsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { constellationsAssetRows } from './load/constellationsAssetRows';
import { constellationsPass } from './passes/constellationsPass';
import { produceConstellationCaptions } from './present/produceConstellationCaptions';

export const constellationsLayer = defineLayer({
  name: 'constellations',
  settings: constellationsLayerSettings,
  visibility: constellationsVisibility,
  sources: CONSTELLATIONS_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [constellationsPass(runtime)],
  assets: constellationsAssetRows,
  guides: (runtime) => ({
    screenLabels: [
      // NEAR0, not COSMO: the figure anchors sit at parsec distances, inside
      // COSMO's fixed 0.01 Mpc near plane, so a COSMO-projected label could
      // never draw (full story in `constellationCaptions.ts`'s header).
      {
        slab: NEAR0,
        id: 'constellationCaptions',
        label: 'constellations',
        produceLabels: produceConstellationCaptions(runtime),
      },
    ],
  }),
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'constellations', label: 'Constellations' } }],
});

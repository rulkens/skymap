/**
 * The constellations Layer: the 88 classical asterisms drawn as true-3D stick
 * figures between their real member stars — one renderer, one pass, one asset
 * slot, one source, and the figure-name captions, a show and a label entry.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { constellationsLayerSettings } from './state/slices';
import { constellationsVisibility } from './visibility';
import { CONSTELLATIONS_SOURCE_ROWS } from './sources/constellationsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { constellationsAssetRows } from './figures/load/constellationsAssetRows';
import { constellationsPass } from './figures/passes/constellationsPass';
import { constellationLabelSource } from './figures/present/constellationLabelSource';

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
    screenLabels: [constellationLabelSource(runtime)],
  }),
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'constellations', label: 'Constellations' } }],
});

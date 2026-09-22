/**
 * The cosmicWebFilaments Layer: the DisPerSE cosmic-web skeleton — one
 * renderer, one pass, one asset slot, one fade row, one source. No `ui`: the
 * Cosmic Web section's Style picker is derived from the cosmicWebFilaments AND
 * cosmicWebDensity masters together, so it moves with `cosmicWebDensity`, not
 * here.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { cosmicWebFilamentsLayerSettings } from './state/slices';
import { FILAMENTS_SOURCE_ROWS } from './sources/filamentsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { filamentsAssetRows } from './load/filamentsAssetRows';
import { filamentsPass } from './passes/filamentsPass';
import { filamentsFadeRows } from './present/filamentsFadeRows';

export const cosmicWebFilamentsLayer = defineLayer({
  name: 'cosmicWebFilaments',
  settings: cosmicWebFilamentsLayerSettings,
  sources: FILAMENTS_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [filamentsPass(runtime)],
  assets: filamentsAssetRows,
  fades: filamentsFadeRows,
});

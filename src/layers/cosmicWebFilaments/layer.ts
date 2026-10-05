/**
 * The cosmicWebFilaments Layer: the DisPerSE cosmic-web skeleton — one
 * renderer, one pass, one asset slot, one fade row, one source and its own
 * SettingsPanel section (a sibling of `cosmicWebDensity`'s, not a shared
 * one — the Style-picker shortcut that once batched both masters is gone).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { cosmicWebFilamentsLayerSettings } from './state/slices';
import { FILAMENTS_SOURCE_ROWS } from './sources/filamentsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { filamentsAssetRows } from './load/filamentsAssetRows';
import { filamentsPass } from './passes/filamentsPass';
import { filamentsFadeRows } from './present/filamentsFadeRows';
import CosmicWebFilamentsSectionContainer from './ui/CosmicWebFilamentsSectionContainer';

export const cosmicWebFilamentsLayer = defineLayer({
  name: 'cosmicWebFilaments',
  settings: cosmicWebFilamentsLayerSettings,
  sources: FILAMENTS_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [filamentsPass(runtime)],
  assets: filamentsAssetRows,
  fades: filamentsFadeRows,
  ui: [{ slot: 'main', content: CosmicWebFilamentsSectionContainer }],
});

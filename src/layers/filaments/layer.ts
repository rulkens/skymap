/**
 * The filaments Layer: the DisPerSE cosmic-web skeleton — one renderer, one
 * pass, one asset slot, one fade row, one source. No `ui`: the Cosmic Web
 * section's Style picker is derived from the filaments AND volume masters
 * together, so it moves with `volume`, not here.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { filamentsLayerSettings } from './settings/filamentsLayerSettings';
import { FILAMENTS_SOURCE_ROWS } from './sources/filamentsSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { filamentsAssetRows } from './load/filamentsAssetRows';
import { filamentsPass } from './passes/filamentsPass';
import { filamentsFadeRows } from './present/filamentsFadeRows';

export const filamentsLayer = defineLayer({
  name: 'filaments',
  // A fragment listed here may not also sit in `UNFORMED_SETTINGS_FRAGMENTS`:
  // the reducer-key uniqueness assert throws at import (Ruling 15).
  settings: filamentsLayerSettings,
  sources: FILAMENTS_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [filamentsPass(runtime)],
  assets: filamentsAssetRows,
  fades: filamentsFadeRows,
});

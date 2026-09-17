/**
 * The shipped app's composition. A module-level literal, not a factory: nothing here
 * reads the viewport or the URL at import time. `layers` is no longer pure DATA though
 * (Ruling 16) — a Layer's `create` pulls its renderers and `?worker`/`?static` modules
 * into every graph that value-imports this module, `SettingsPanel.tsx` included. Not the
 * store's: the settings reducer reaches each Layer's settings tuple via `appSettingsSlices`.
 */

import type { EngineComposition } from '../@types/engine/EngineComposition';
import { EARTH_HOME } from '../data/selection/earthHome';
import { filamentsLayer } from '../layers/filaments/layer';
import { galaxyCatalogLayer } from '../layers/galaxyCatalog/layer';

export const APP_COMPOSITION = {
  layers: [galaxyCatalogLayer, filamentsLayer] as const,
  home: EARTH_HOME,
} satisfies EngineComposition<readonly [typeof galaxyCatalogLayer, typeof filamentsLayer]>;

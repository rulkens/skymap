/**
 * The shipped app's composition. A module-level literal, not a factory: nothing here
 * reads the viewport or the URL at import time. `layers` is no longer pure DATA though
 * (Ruling 16) — a Layer's `create` pulls its renderers and `?worker`/`?static` modules
 * into any graph that reaches here, the store's included. That edge is acyclic because
 * `layerImportBoundary` forbids the return one.
 */

import type { EngineComposition } from '../@types/engine/EngineComposition';
import { EARTH_HOME } from '../data/selection/earthHome';
import { galaxyCatalogLayer } from '../layers/galaxyCatalog/layer';

export const APP_COMPOSITION = {
  layers: [galaxyCatalogLayer] as const,
  home: EARTH_HOME,
} satisfies EngineComposition<readonly [typeof galaxyCatalogLayer]>;

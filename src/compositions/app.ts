/**
 * The shipped app's composition. A module-level literal, not a factory: nothing here
 * reads the viewport or the URL at import time. `layers` is no longer pure DATA though
 * (Ruling 16) — a Layer's `create` pulls its renderers and `?worker`/`?static` modules
 * into every graph that value-imports this module, `SettingsPanel.tsx` included. Not the
 * store's: the settings reducer reaches each Layer's settings tuple via `appSettingsSlices`.
 */

import type { EngineComposition } from '../@types/engine/EngineComposition';
import { EARTH_HOME } from '../data/selection/earthHome';
import { constellationsLayer } from '../layers/constellations/layer';
import { cosmicWebFilamentsLayer } from '../layers/cosmicWebFilaments/layer';
import { flowLayer } from '../layers/flow/layer';
import { galaxyCatalogLayer } from '../layers/galaxyCatalog/layer';
import { localBubbleLayer } from '../layers/localBubble/layer';
import { starCatalogLayer } from '../layers/starCatalog/layer';
import { zoneOfAvoidanceLayer } from '../layers/zoneOfAvoidance/layer';

export const APP_COMPOSITION = {
  layers: [
    galaxyCatalogLayer,
    starCatalogLayer,
    cosmicWebFilamentsLayer,
    flowLayer,
    zoneOfAvoidanceLayer,
    localBubbleLayer,
    constellationsLayer,
  ] as const,
  home: EARTH_HOME,
} satisfies EngineComposition<
  readonly [
    typeof galaxyCatalogLayer,
    typeof starCatalogLayer,
    typeof cosmicWebFilamentsLayer,
    typeof flowLayer,
    typeof zoneOfAvoidanceLayer,
    typeof localBubbleLayer,
    typeof constellationsLayer,
  ]
>;

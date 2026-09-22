/**
 * The Layer settings clusters this app composes in — one tuple per Layer,
 * imported from that Layer's own `state/slices.ts` rather than off
 * `APP_COMPOSITION` (see `galaxyCatalogLayerSettings` for the circular-type-alias
 * reason).
 */

import { bodyLayerSettings } from '../layers/body/state/slices';
import { constellationsLayerSettings } from '../layers/constellations/state/slices';
import { filamentsLayerSettings } from '../layers/cosmicWebFilaments/state/slices';
import { flowLayerSettings } from '../layers/flow/state/slices';
import { galaxyCatalogLayerSettings } from '../layers/galaxyCatalog/state/slices';
import { localBubbleLayerSettings } from '../layers/localBubble/state/slices';
import { milkyWayLayerSettings } from '../layers/milkyWay/state/slices';
import { starCatalogLayerSettings } from '../layers/starCatalog/state/slices';
import { structureLayerSettings } from '../layers/structure/state/slices';
import { volumeLayerSettings } from '../layers/cosmicWebDensity/state/slices';
import { zoneOfAvoidanceLayerSettings } from '../layers/zoneOfAvoidance/state/slices';

export const APP_SETTINGS_SLICES = [
  ...bodyLayerSettings,
  ...constellationsLayerSettings,
  ...filamentsLayerSettings,
  ...flowLayerSettings,
  ...galaxyCatalogLayerSettings,
  ...localBubbleLayerSettings,
  ...milkyWayLayerSettings,
  ...starCatalogLayerSettings,
  ...structureLayerSettings,
  ...volumeLayerSettings,
  ...zoneOfAvoidanceLayerSettings,
] as const;

/**
 * The exhibits this app composes in: the cross-Layer ones authored here, then each Layer's, keyed
 * by id. Imported from each Layer's own `exhibits/exhibits.ts` rather than off `APP_COMPOSITION`,
 * whose `layer.ts` rows would pull renderers into every reader and reopen the module-init cycle.
 */

import { bodyLayerExhibits } from '../layers/body/exhibits/exhibits';
import { cosmicHorizonLayerExhibits } from '../layers/cosmicHorizon/exhibits/exhibits';
import { missionsLayerExhibits } from '../layers/missions/exhibits/exhibits';
import { exhibitsById } from '../utils/exhibits/exhibitsById';
import { cosmicFlows } from './exhibits/cosmicFlows';
import { cosmicWeb } from './exhibits/cosmicWeb';
import { zoneOfAvoidance } from './exhibits/zoneOfAvoidance';

export const APP_EXHIBIT_REGISTRY = exhibitsById([
  cosmicFlows,
  cosmicWeb,
  zoneOfAvoidance,
  ...cosmicHorizonLayerExhibits,
  ...bodyLayerExhibits,
  ...missionsLayerExhibits,
]);

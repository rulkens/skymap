/**
 * The shipped app's composition. A module-level literal, not a factory: every field is
 * pure data, so nothing here reads the viewport or the URL at import time. `layers` is
 * empty until the first renderer moves behind a Layer.
 */

import type { EngineComposition } from '../@types/engine/EngineComposition';
import { EARTH_HOME } from '../data/selection/earthHome';

export const APP_COMPOSITION: EngineComposition<[]> = {
  layers: [],
  home: EARTH_HOME,
};

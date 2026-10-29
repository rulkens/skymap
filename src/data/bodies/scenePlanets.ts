/**
 * scenePlanets — planet + moon identity rows. Order is the pick order: a pick decodes to a
 * body by array position (`bodySelectionRow.ts`'s `resolvePick`), so rows only ever append.
 */

import type { PlanetBody } from '../../@types/scene/PlanetBody';
import { isPlanetBody } from '../../utils/scene/isPlanetBody';
import { LAYER_BODY_ROWS } from './layerBodyRows';

export const SCENE_PLANETS: readonly PlanetBody[] = LAYER_BODY_ROWS.map((row) => row.body).filter(
  isPlanetBody,
);

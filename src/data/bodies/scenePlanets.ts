/**
 * scenePlanets — planet + moon identity rows, projected from the fold of every
 * Layer's body rows (authored in the body Layer's `bodies/`). Order is the pick
 * order: a pick decodes to a body by array position (see `bodySelectionRow.ts`'s
 * `resolvePick`), so rows only ever append. Positions are not baked here but
 * derived per instant by `deriveBodyStates`.
 */

import type { PlanetBody } from '../../@types/scene/PlanetBody';
import { isPlanetBody } from '../../utils/scene/isPlanetBody';
import { LAYER_BODY_ROWS } from './layerBodyRows';

export const SCENE_PLANETS: readonly PlanetBody[] = LAYER_BODY_ROWS.map((row) => row.body).filter(
  isPlanetBody,
);

/**
 * scenePlanets — planet + moon identity rows. Order is the pick order: a pick decodes to a
 * body by array position (`bodySelectionRow.ts`'s `resolvePick`), so rows only ever append.
 */

import type { PlanetBody } from '../../@types/scene/PlanetBody';
import { isPlanetBody } from '../../utils/scene/isPlanetBody';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';

export const SCENE_PLANETS: readonly PlanetBody[] = APP_BODY_REGISTRY.map((row) => row.body).filter(
  isPlanetBody,
);

/**
 * SCENE_EARTH — Earth's identity-only scene record (strictly the Earth–Moon
 * barycentre), projected from the fold's one `EarthBody` row, authored in the
 * body Layer's `bodies/earth.ts`.
 *
 * Position and orientation are NOT baked: they are derived per sim-instant
 * from `ORBITAL_ELEMENTS` by `deriveBodyStates`.
 */

import type { EarthBody } from '../../@types/scene/EarthBody';
import { isEarthBody } from '../../utils/scene/isEarthBody';
import { LAYER_BODY_ROWS } from './layerBodyRows';

function earthRow(): EarthBody {
  const earth = LAYER_BODY_ROWS.map((row) => row.body).find(isEarthBody);
  if (!earth) throw new Error('sceneEarth: no Layer body row seeds Earth');
  return earth;
}

export const SCENE_EARTH: EarthBody = earthRow();

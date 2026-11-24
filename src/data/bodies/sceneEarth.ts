/**
 * SCENE_EARTH — Earth's identity-only record (strictly the Earth–Moon barycentre), projected
 * from the fold's one `EarthBody` row. Position and orientation come from `deriveBodyStates`.
 */

import type { EarthBody } from '../../@types/scene/EarthBody';
import { SCENE_EARTH_BODIES } from './sceneEarthBodies';

function earthRow(): EarthBody {
  const earth = SCENE_EARTH_BODIES[0];
  if (!earth) throw new Error('sceneEarth: no Layer body row seeds Earth');
  return earth;
}

export const SCENE_EARTH: EarthBody = earthRow();

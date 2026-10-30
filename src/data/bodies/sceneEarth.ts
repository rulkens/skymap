/**
 * SCENE_EARTH — Earth's identity-only record (strictly the Earth–Moon barycentre), projected
 * from the fold's one `EarthBody` row. Position and orientation come from `deriveBodyStates`.
 */

import type { EarthBody } from '../../@types/scene/EarthBody';
import { isEarthBody } from '../../utils/scene/isEarthBody';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';

function earthRow(): EarthBody {
  const earth = APP_BODY_REGISTRY.map((row) => row.body).find(isEarthBody);
  if (!earth) throw new Error('sceneEarth: no Layer body row seeds Earth');
  return earth;
}

export const SCENE_EARTH: EarthBody = earthRow();

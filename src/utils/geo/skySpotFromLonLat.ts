import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { degToRad } from '../math/degToRad';

/** A place given in degrees (a palette place, typed coordinates) as the spot a person stands on. */
export function skySpotFromLonLat(body: SceneBodyId, { lonDeg, latDeg }: LonLatDeg): SkySpot {
  return { body, lonRad: degToRad(lonDeg), latRad: degToRad(latDeg) };
}

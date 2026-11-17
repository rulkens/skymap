import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { directionToLonLatDeg } from './directionToLonLatDeg';
import { degToRad } from '../math/degToRad';

/** The spot over a body-fixed point (any length): `skySpotRadial`'s inverse. */
export function skySpotAt(body: SceneBodyId, pointLocalM: Readonly<Vec3>): SkySpot {
  const { lonDeg, latDeg } = directionToLonLatDeg(pointLocalM);
  return { body, lonRad: degToRad(lonDeg), latRad: degToRad(latDeg) };
}

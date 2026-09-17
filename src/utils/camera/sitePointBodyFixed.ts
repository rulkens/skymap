/**
 * The site point in the host's body-fixed metres: the ground radius under the
 * site + the mesh's wheel lift. The renderer and the camera both call this with
 * the same ground, or the rover drifts in frame as the camera moves.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';

export function sitePointBodyFixed(
  site: SurfaceFixedSite,
  groundRadiusAtM: GroundRadiusLookup,
): Vec3 {
  const dirBodyFixed = surfacePointBodyFixed(site.latDeg, site.lonDeg, 1);
  const radiusM = groundRadiusAtM(dirBodyFixed) + site.altitudeM;
  return [dirBodyFixed[0] * radiusM, dirBodyFixed[1] * radiusM, dirBodyFixed[2] * radiusM];
}

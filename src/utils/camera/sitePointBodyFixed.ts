/**
 * The site point in the HOST's body-fixed metres — deliberately the expression
 * `deriveBodyStates` places the rover with, off the same row and the same
 * ground radius: diverge and the rover drifts in frame as the camera moves.
 * `hostRadiusM` is the FULL ground radius (datum + baked height, see
 * `siteGroundRadiusM`), never a bare datum — this function knows nothing
 * about terrain. An anchored site's `altitudeM` is already folded into that
 * baked height (`buildSiteGroundHeights`'s `anchoredSeat`) — applying it
 * again here would double the lift, so only a resting site's own applies.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';

export function sitePointBodyFixed(site: SurfaceFixedSite, hostRadiusM: number): Vec3 {
  const liftM = site.seat === 'anchored' ? 0 : site.altitudeM;
  return surfacePointBodyFixed(site.latDeg, site.lonDeg, hostRadiusM + liftM);
}

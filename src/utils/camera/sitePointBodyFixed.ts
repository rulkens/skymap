/**
 * The site point in the HOST's body-fixed metres — deliberately the expression
 * `deriveBodyStates` places the rover with, off the same row and the same
 * ground radius: diverge and the rover drifts in frame as the camera moves.
 */

import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';

export function sitePointBodyFixed(site: SurfaceFixedSite, hostRadiusM: number): Vec3 {
  return surfacePointBodyFixed(site.latDeg, site.lonDeg, hostRadiusM + site.altitudeM);
}

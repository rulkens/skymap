/**
 * The site point in the HOST's body-fixed metres — deliberately the expression
 * `deriveBodyStates` places the rover with, off the same row and the same
 * ground radius (datum + terrain): diverge and the rover drifts in frame as
 * the camera moves. `terrainHeightAt` defaults to 0 for every existing camera
 * caller, which still wants the datum-only radius (§8.3's remaining
 * `radiusM` routing is F3b); only a caller that hands one in gets terrain.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfacePointBodyFixed } from '../geo/surfacePointBodyFixed';

export function sitePointBodyFixed(
  site: SurfaceFixedSite,
  hostRadiusM: number,
  terrainHeightAt: TerrainHeightAtLookup = () => 0,
): Vec3 {
  const dirBodyFixed = surfacePointBodyFixed(site.latDeg, site.lonDeg, 1);
  const radiusM =
    hostRadiusM + terrainHeightAt(site.hostId as BodyId, dirBodyFixed) + site.altitudeM;
  return [dirBodyFixed[0] * radiusM, dirBodyFixed[1] * radiusM, dirBodyFixed[2] * radiusM];
}

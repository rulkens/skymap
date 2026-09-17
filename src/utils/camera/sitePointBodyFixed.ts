/**
 * The site point in the host's body-fixed metres: datum radius + terrain
 * height + the mesh's wheel lift, along the site's lat/lon direction.
 * `terrainHeightAt` defaults to 0 because the four camera callers still want
 * a datum-only radius until F3b routes them.
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

import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';
import type { SurfaceTileManifest } from '../../../src/@types/scene/SurfaceTileManifest';
import { MESH_ASSETS } from '../../../src/data/bodies/meshAssets.generated';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { degToRad } from '../../../src/utils/math/degToRad';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';
import { deepestBandLevel } from './deepestBandLevel';
import { readGroundHeightM } from './readGroundHeightM';
import { terrainUpEnu } from './terrainUpEnu';

const RAD_TO_DEG = 180 / Math.PI;

/** siteGroundUpEnu — the ground's up under `site`, as (east, north, up): a
 *  plane fitted across the body's own half-width, the span its contact points
 *  actually average the slope over. One post would read tile quantisation. */
export async function siteGroundUpEnu(
  site: SurfaceFixedSite,
  manifest: SurfaceTileManifest,
): Promise<Vec3> {
  const host = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'siteGroundUpEnu');
  const { meshKey } = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'siteGroundUpEnu');
  const asset = MESH_ASSETS[meshKey];
  if (asset === undefined) {
    throw new Error(`siteGroundUpEnu: no MESH_ASSETS entry for '${meshKey}'`);
  }
  const baselineM = asset.boundingRadiusM;
  const z = deepestBandLevel(manifest, site.latDeg, site.lonDeg);
  const dLatDeg = (baselineM / host.surface.datumRadiusM) * RAD_TO_DEG;
  const dLonDeg = dLatDeg / Math.cos(degToRad(site.latDeg));
  const at = (latDeg: number, lonDeg: number) => readGroundHeightM(manifest, latDeg, lonDeg, z);
  const [northM, southM, eastM, westM] = await Promise.all([
    at(site.latDeg + dLatDeg, site.lonDeg),
    at(site.latDeg - dLatDeg, site.lonDeg),
    at(site.latDeg, site.lonDeg + dLonDeg),
    at(site.latDeg, site.lonDeg - dLonDeg),
  ]);
  return terrainUpEnu(northM, southM, eastM, westM, baselineM);
}

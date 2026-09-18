import type { SurfaceFixedSite } from '../../../../src/@types/scene/SurfaceFixedSite';
import { MESH_ASSETS } from '../../../../src/data/bodies/meshAssets.generated';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';

/** siteFootprintRadiusM — the ground span a site's body rests on: its mesh's
 *  bounding radius. The slope fit and the seat fit share it, so the body is
 *  tilted and lifted against the same patch of ground. */
export function siteFootprintRadiusM(site: SurfaceFixedSite): number {
  const { meshKey } = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'siteFootprintRadiusM');
  const asset = MESH_ASSETS[meshKey];
  if (asset === undefined) {
    throw new Error(`siteFootprintRadiusM: no MESH_ASSETS entry for '${meshKey}'`);
  }
  return asset.boundingRadiusM;
}

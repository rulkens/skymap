/**
 * meshAnchorSite — the `SurfaceFixedSite` a georeferenced mesh key's build
 * shifts its own origin onto, found through `SCENE_MESH_BODIES` the same way
 * `meshGroundUpSource` finds a resting key's ground-up. `georeferenced` on
 * `MESH_SOURCES` and `seat: 'anchored'` on the site must always travel
 * together — either alone leaves the build with no way to place the mesh, so
 * every mismatch throws rather than silently picking a default.
 */

import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { MESH_SOURCES } from '../io/meshSources';

export function meshAnchorSite(meshKey: string): SurfaceFixedSite | undefined {
  const georeferenced = MESH_SOURCES[meshKey]?.georeferenced;
  const sites = SCENE_MESH_BODIES.filter((body) => body.meshKey === meshKey)
    .map((body) => SURFACE_FIXED_SITES.find((site) => site.id === body.id))
    .filter((site): site is SurfaceFixedSite => site !== undefined);
  const anchored = sites.filter((site) => site.seat === 'anchored');

  for (const site of anchored) {
    if (georeferenced === undefined) {
      throw new Error(
        `meshAnchorSite: site '${site.id}' is anchored but MESH_SOURCES.${meshKey} has no ` +
          'georeferenced entry',
      );
    }
  }
  if (georeferenced === undefined) return undefined;
  if (anchored.length === 0) {
    throw new Error(
      `meshAnchorSite: MESH_SOURCES.${meshKey} is georeferenced but no anchored ` +
        'SurfaceFixedSite uses it',
    );
  }
  if (anchored.length > 1) {
    throw new Error(
      `meshAnchorSite: '${meshKey}' backs ${anchored.length} anchored sites — one mesh key, one anchor`,
    );
  }
  return anchored[0];
}

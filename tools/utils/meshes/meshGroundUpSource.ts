/**
 * meshGroundUpSource — which meshes bake against a ground plane, and which
 * way is "up" in their SOURCE frame (before `bodyFromSource` remaps to body
 * space, where ground up is always +Z). A key is seated when some
 * `SCENE_MESH_BODIES` entry using it has an id in `SURFACE_FIXED_SITES` with
 * `seat: 'resting'` — an `anchored` site places its own georeferenced mesh,
 * no ground-fit needed. A key backing both a seated and a floating body has
 * no single answer.
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { rotateVec3ByTightMat3T } from '../../../src/utils/math/rotateVec3ByTightMat3T';
import { MESH_SOURCES } from '../io/meshSources';

const SEATED_IDS = new Set(
  SURFACE_FIXED_SITES.filter((site) => site.seat === 'resting').map((site) => site.id),
);

export function meshGroundUpSource(meshKey: string): Vec3 | undefined {
  const bodies = SCENE_MESH_BODIES.filter((body) => body.meshKey === meshKey);
  const seated = bodies.filter((body) => SEATED_IDS.has(body.id));
  const floating = bodies.filter((body) => !SEATED_IDS.has(body.id));
  if (seated.length > 0 && floating.length > 0) {
    throw new Error(
      `meshGroundUpSource: '${meshKey}' backs both a seated body (${seated
        .map((body) => body.id)
        .join(', ')}) and a floating body (${floating.map((body) => body.id).join(', ')})`,
    );
  }
  if (seated.length === 0) return undefined;
  const bodyFromSource = MESH_SOURCES[meshKey]?.bodyFromSource ?? IDENTITY_MAT3;
  return rotateVec3ByTightMat3T([0, 0, 1], bodyFromSource);
}

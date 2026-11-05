/**
 * isRegistryBodyId — is `id` a non-star scene body (Earth, planet, moon, any mesh body)?
 * Read by `decodeFramedPose`'s `#pose=` body arm. Not `SCENE_BODIES`: it still lists the
 * seeded stars, but a star's identity is a `starCatalog` ref, so `b,sirius,…` must decode to nothing.
 */

import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { SCENE_MESH_BODIES } from '../../data/bodies/sceneMeshBodies';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export function isRegistryBodyId(id: string): id is SceneBodyId {
  return (
    Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id)) ||
    SCENE_MESH_BODIES.some((body) => body.id === id)
  );
}

/**
 * isRegistryBodyId — is `id` a non-star scene body: Earth, a planet or moon, or
 * any mesh body, whichever Layer owns it? `decodeFramedPose`'s `#pose=` body arm
 * reads it, since a pose may sit at a craft as well as a planet. The narrower
 * `isCoreBodyId` is the `body` selection kind's own claim.
 *
 * Not `SCENE_BODIES`: that still lists the seeded stars for the camera and
 * occluder readers, but a star's identity is a `starCatalog` ref, so
 * `b,sirius,…` must decode to nothing.
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

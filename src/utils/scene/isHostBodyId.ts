/**
 * isHostBodyId — is `id` a body the camera's arm tree can host: Earth, a planet or a
 * moon? Read by `decodeFramedPose`'s `#pose=` body and sky arms. Not a craft: the body
 * arm hosts no mesh body, so a `b,hubble` link threw `hostOrThrow` on every frame. Not a
 * star either: its identity is a `starCatalog` ref, and `SCENE_BODIES` still lists the
 * seeded ones, so `BODY_PICK_ROWS` is the table.
 */

import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export function isHostBodyId(id: string): id is SceneBodyId {
  return Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id));
}

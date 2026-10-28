/**
 * isBodyKindId — is `id` a body the `body` selection kind names: Earth, a planet or moon, one of
 * the `BODY_PICK_ROWS` ids? The craft are the missions Layer's `craft` kind and the Earth scenes
 * the earthScenes Layer's `earthScene` kind, neither in those rows, so the three kinds'
 * `body-<id>` claims are disjoint by construction.
 */

import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

export function isBodyKindId(id: string): id is SceneBodyId {
  return Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id));
}

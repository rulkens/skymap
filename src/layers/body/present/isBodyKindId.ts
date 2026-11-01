/**
 * isBodyKindId — is `id` one of the `BODY_PICK_ROWS` ids the `body` kind names? Craft and Earth
 * scenes are not in those rows, so the three kinds' `body-<id>` claims are disjoint.
 */

import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

export function isBodyKindId(id: string): id is SceneBodyId {
  return Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id));
}

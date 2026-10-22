/**
 * isCoreBodyId — is `id` a body the `body` selection kind names: Earth, a planet
 * or moon, or an earthScenes mesh body (`EARTH_SCENE_BODY_IDS`)? The craft are
 * the missions Layer's `craft` kind, so the two kinds' `body-<id>` claims are
 * disjoint by construction.
 */

import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { EARTH_SCENE_BODY_IDS } from '../../data/bodies/earthSceneBodyIds';

export function isCoreBodyId(id: string): boolean {
  return (
    Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id)) ||
    EARTH_SCENE_BODY_IDS.has(id)
  );
}

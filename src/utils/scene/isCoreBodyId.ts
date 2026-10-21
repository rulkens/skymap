/**
 * isCoreBodyId — is `id` a body the `body` selection kind names: Earth, a planet
 * or moon, or a mesh body core still owns (`CORE_MESH_BODY_IDS`)? The craft are
 * the missions Layer's `craft` kind, so the two kinds' `body-<id>` claims are
 * disjoint by construction.
 */

import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { CORE_MESH_BODY_IDS } from '../../data/bodies/coreMeshBodyIds';

export function isCoreBodyId(id: string): boolean {
  return (
    Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id)) ||
    CORE_MESH_BODY_IDS.has(id)
  );
}

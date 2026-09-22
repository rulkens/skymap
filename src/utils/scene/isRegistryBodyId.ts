/**
 * isRegistryBodyId — does some body source's seed table hold `id`? Shared by
 * `decodeFramedPose` (a `#pose=` body arm) and `bodySelectionRow` (a
 * `focus=body-<id>` deep link), so a body is recognised the same way by both.
 *
 * `BODY_PICK_ROWS`, not `SCENE_BODIES`: the latter still lists the seeded stars
 * for the camera and occluder readers, but a star's identity is a `starCatalog`
 * ref now, so `body-sirius` must decode to nothing.
 */

import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';

export function isRegistryBodyId(id: string): boolean {
  return Object.values(BODY_PICK_ROWS).some((seeds) => seeds.some((seed) => seed.id === id));
}

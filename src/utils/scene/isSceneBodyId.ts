/**
 * isSceneBodyId — is `id` one of `SCENE_BODIES`' own ids? Shared by
 * `decodeFramedPose` (a `#pose=` body arm) and `bodySelectionRow` (a
 * `focus=body-<id>` deep link), so a scene body is recognised the same way
 * by both.
 */
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';

export function isSceneBodyId(id: string): boolean {
  return SCENE_BODIES.some((b) => b.id === id);
}

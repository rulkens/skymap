/**
 * Numbered asteroids the body Layer draws as meshes, by MPC number. The asteroids Layer hides,
 * never picks and never lists these rows; the body Layer claims their `asteroid-<n>` links and
 * opens the body instead.
 */
import { asSceneBodyId } from '../../utils/scene/asSceneBodyId';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export const MESH_ASTEROID_BODIES: ReadonlyMap<number, SceneBodyId> = new Map([
  [1, asSceneBodyId('ceres')],
  [4, asSceneBodyId('vesta')],
  [101955, asSceneBodyId('bennu')],
  [134340, asSceneBodyId('pluto')],
]);

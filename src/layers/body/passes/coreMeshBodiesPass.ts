/**
 * coreMeshBodiesPass — core's own bodies (the shape-model moons) as lit meshes on their host's
 * body-m row.
 */

import { CORE_SCENE_BODY_IDS } from '../present/coreSceneBodyIds';
import { sceneBodyPickId } from '../../../utils/picking/sceneBodyPickId';
import { meshBodiesPassOver } from '../../../services/engine/frame/meshBodiesPassOver';

export const coreMeshBodiesPass = meshBodiesPassOver(
  'core-mesh-bodies',
  CORE_SCENE_BODY_IDS,
  sceneBodyPickId,
);

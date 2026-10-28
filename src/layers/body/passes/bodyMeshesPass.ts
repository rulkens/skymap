/**
 * bodyMeshesPass — the body Layer's bodies with a shape model (the moons) as lit meshes on their
 * host's body-m row, through core's one mesh renderer.
 */

import { BODY_SCENE_BODY_IDS } from '../present/bodySceneBodyIds';
import { sceneBodyPickId } from '../../../utils/picking/sceneBodyPickId';
import { meshBodiesPassOver } from '../../../services/engine/frame/meshBodiesPassOver';

export const bodyMeshesPass = meshBodiesPassOver(
  'body-meshes',
  BODY_SCENE_BODY_IDS,
  sceneBodyPickId,
);

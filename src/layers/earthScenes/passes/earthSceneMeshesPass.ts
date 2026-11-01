/**
 * earthSceneMeshesPass — Søndermarken as a lit mesh on Earth's body-m row, through core's one
 * mesh handle (the slot stays core's). Unpicked: it has no pick seed, and `body-soendermarken`
 * stays claimed by the `body` selection kind.
 */

import { meshBodiesPassOver } from '../../../services/engine/frame/meshBodiesPassOver';
import { EARTH_SCENE_BODY_IDS } from '../../../data/bodies/earthSceneBodyIds';

export const earthSceneMeshesPass = meshBodiesPassOver(
  'earth-scene-meshes',
  EARTH_SCENE_BODY_IDS,
  () => null,
);

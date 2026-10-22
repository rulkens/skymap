/**
 * The earthScenes Layer: the Earth scene rows (Søndermarken) and their drawing: the mesh
 * through core's one mesh handle (the slot stays core's), the glint through its own renderer.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { EARTH_SCENES_BODY_ROWS } from './bodies/earthScenesBodyRows';
import { create } from './create';
import { destroy } from './destroy';
import { earthSceneMeshesPass } from './passes/earthSceneMeshesPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { EARTH_SCENE_BODY_IDS } from '../../data/bodies/earthSceneBodyIds';

export const earthScenesLayer = defineLayer({
  name: 'earthScenes',
  bodies: EARTH_SCENES_BODY_ROWS,
  create,
  destroy,
  passes: (runtime) => [
    earthSceneMeshesPass,
    glintsPassOver('earth-scene-glints', EARTH_SCENE_BODY_IDS, runtime.glintRenderer),
  ],
});

/**
 * The earthScenes Layer: the Earth scene rows (Søndermarken) and their drawing: the mesh
 * through core's one mesh handle (the slot stays core's), the glint through its own renderer.
 * It owns the `earthScene` selection kind (unpicked, uncaptioned) and the scenes' palette rows;
 * a scene's InfoCard is the body card.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { EARTH_SCENES_BODY_ROWS } from './bodies/earthScenesBodyRows';
import { create } from './create';
import { destroy } from './destroy';
import { earthSceneMeshesPass } from './passes/earthSceneMeshesPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { EARTH_SCENE_BODY_IDS } from '../../data/bodies/earthSceneBodyIds';
import { earthSceneSelectionRow } from './present/earthSceneSelectionRow';
import { earthSceneSearch } from './present/earthSceneSearch';
import BodyDetailCardContainer from '../../components/containers/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const earthScenesLayer = defineLayer({
  name: 'earthScenes',
  bodies: EARTH_SCENES_BODY_ROWS,
  create,
  destroy,
  passes: (runtime) => [
    earthSceneMeshesPass,
    glintsPassOver('earth-scene-glints', EARTH_SCENE_BODY_IDS, runtime.glintRenderer),
  ],
  selection: () => [earthSceneSelectionRow()],
  search: () => earthSceneSearch(),
  ui: [
    {
      slot: 'detailCard',
      content: { type: 'earthScene', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});

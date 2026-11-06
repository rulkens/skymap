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
import { earthSceneMeshesPass } from './scenes/passes/earthSceneMeshesPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { EARTH_SCENE_BODY_IDS } from './scenes/data/earthSceneBodyIds';
import { earthSceneSelectionRow } from './scenes/present/earthSceneSelectionRow';
import { earthScenesSelectionKinds } from './scenes/present/kinds';
import { earthSceneSearch } from './scenes/present/earthSceneSearch';
import BodyDetailCardContainer from '../body/card/ui/BodyDetailCardContainer';
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
  selection: { kinds: earthScenesSelectionKinds, rows: () => [earthSceneSelectionRow()] },
  search: () => earthSceneSearch(),
  ui: [
    {
      slot: 'detailCard',
      content: { type: 'earthScene', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});

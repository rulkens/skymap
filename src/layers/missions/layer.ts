/**
 * The missions Layer: the craft's trail rows, captions and their "Spacecraft" label item, the
 * `missions` and `missionTrails` settings clusters, the track load, and the Voyager exhibit with
 * its mission timeline kind. It owns the nine craft body rows, their registry row and the `craft`
 * selection kind with its pick code, and draws them: meshes (rows and slots its own) through core's
 * one mesh handle, the rovers' contact shadows, and glints through its own glint renderer.
 * A craft's InfoCard is the body card.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { missionsLayerSettings } from './state/slices';
import { missionsVisibility } from './visibility';
import { loadSpacecraftTracksSaga } from './trails/sagas/loadSpacecraftTracksSaga';
import { create } from './create';
import { destroy } from './destroy';
import { missionMeshesPass } from './craft/passes/missionMeshesPass';
import { contactShadowsPass } from './contactShadows/passes/contactShadowsPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { MISSION_CRAFT_IDS } from './craft/present/missionCraftIds';
import { missionLabelSource } from './craft/present/missionLabelSource';
import { emphasisDim } from './craft/utils/emphasisDim';
import { MISSION_TRAIL_ROWS } from './trails/data/missionTrailRows';
import { craftSelectionRow } from './selection/craftSelectionRow';
import { missionsSelectionKinds } from './selection/kinds';
import { craftSearch } from './craft/present/craftSearch';
import { missionsLayerExhibits } from './exhibits/exhibits';
import { MISSIONS_BODY_ROWS } from './bodies/missionsBodyRows';
import { meshPresentationsOf } from '../../utils/meshBodies/meshPresentationsOf';
import { meshAssetRow } from '../../services/engine/wiring/meshAssetRow';
import { MISSIONS_SOURCE_ROWS } from './sources/missionsSourceRows';
import BodyDetailCardContainer from '../body/card/ui/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const missionsLayer = defineLayer({
  name: 'missions',
  bodies: MISSIONS_BODY_ROWS,
  sources: MISSIONS_SOURCE_ROWS,
  settings: missionsLayerSettings,
  visibility: missionsVisibility,
  sagas: [loadSpacecraftTracksSaga],
  exhibits: missionsLayerExhibits,
  create,
  destroy,
  assets: (runtime) =>
    meshPresentationsOf(MISSIONS_BODY_ROWS).map((p) => meshAssetRow(runtime.meshBodies, p)),
  passes: (runtime) => [
    missionMeshesPass(runtime),
    contactShadowsPass,
    glintsPassOver('mission-glints', MISSION_CRAFT_IDS, runtime.glintRenderer),
  ],
  guides: (runtime) => ({
    screenLabels: [missionLabelSource(runtime.pickCode)],
    sampledTrails: {
      show: 'missionTrails',
      rows: MISSION_TRAIL_ROWS,
      nearPlanets: (state) => state.settings.missionTrails.nearPlanets,
      dim: (state, id) => emphasisDim(state.settings.missions.craft, id),
    },
  }),
  selection: {
    kinds: missionsSelectionKinds,
    rows: (runtime) => [craftSelectionRow(runtime.pickCode)],
  },
  search: () => craftSearch(),
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'missionTrails', label: 'Mission trails' } },
    {
      slot: 'detailCard',
      content: { type: 'craft', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});

/**
 * The missions Layer: the craft's trails, captions and their "Spacecraft" label item, the
 * `missions` and `missionTrails` settings clusters, the track load, and the Voyager exhibit with
 * its mission timeline kind. It owns the nine craft body rows, their registry row and the `craft`
 * selection kind with its pick code, and draws them: meshes through core's one mesh handle (the
 * slots stay core's), the rovers' contact shadows, and glints through its own glint renderer.
 * A craft's InfoCard is the body card.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { missionsLayerSettings } from './state/slices';
import { missionsVisibility } from './visibility';
import { loadSpacecraftTracksSaga } from './trails/sagas/loadSpacecraftTracksSaga';
import { create } from './create';
import { destroy } from './destroy';
import { missionTrailsPass } from './trails/passes/missionTrailsPass';
import { missionMeshesPass } from './craft/passes/missionMeshesPass';
import { contactShadowsPass } from './contactShadows/passes/contactShadowsPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { MISSION_CRAFT_IDS } from './craft/present/missionCraftIds';
import { produceMissionCaptions } from './craft/present/produceMissionCaptions';
import { craftSelectionRow } from './craft/present/craftSelectionRow';
import { missionsSelectionKinds } from './craft/present/kinds';
import { craftSearch } from './craft/present/craftSearch';
import { missionsLayerExhibits } from './exhibits/exhibits';
import { MISSIONS_BODY_ROWS } from './bodies/missionsBodyRows';
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
  passes: (runtime) => [
    missionTrailsPass(runtime),
    missionMeshesPass(runtime),
    contactShadowsPass,
    glintsPassOver('mission-glints', MISSION_CRAFT_IDS, runtime.glintRenderer),
  ],
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'missionCaptions',
        label: 'missions',
        produceLabels: produceMissionCaptions(runtime.pickCode),
      },
    ],
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

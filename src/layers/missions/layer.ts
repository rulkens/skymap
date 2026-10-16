/**
 * The missions Layer: the sampled craft's (Voyager's) trails and captions, their `missions` and
 * `missionTrails` settings clusters, the track load, and the Voyager exhibit with its mission timeline kind.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { missionsLayerSettings } from './state/slices';
import { missionsVisibility } from './visibility';
import { loadSpacecraftTracksSaga } from './sagas/loadSpacecraftTracksSaga';
import { create } from './create';
import { destroy } from './destroy';
import { missionTrailsPass } from './passes/missionTrailsPass';
import { produceMissionCaptions } from './present/produceMissionCaptions';
import { missionTrailsSettingsRow } from './ui/missionTrailsSettingsRow';
import { missionsLayerExhibits } from './exhibits/exhibits';

export const missionsLayer = defineLayer({
  name: 'missions',
  settings: missionsLayerSettings,
  visibility: missionsVisibility,
  sagas: [loadSpacecraftTracksSaga],
  exhibits: missionsLayerExhibits,
  create,
  destroy,
  passes: (runtime) => [missionTrailsPass(runtime)],
  guides: () => ({
    screenLabels: [{ slab: NEAR0, id: 'missionCaptions', produceLabels: produceMissionCaptions }],
  }),
  ui: [{ slot: 'labelsAndGuides', content: missionTrailsSettingsRow }],
});

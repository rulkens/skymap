/**
 * The missions Layer: the sampled craft's (Voyager's) trails, their `missions` settings cluster,
 * the track load, and the Voyager exhibit with its mission timeline kind.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { missionsLayerSettings } from './state/slices';
import { loadSpacecraftTracksSaga } from './sagas/loadSpacecraftTracksSaga';
import { create } from './create';
import { destroy } from './destroy';
import { missionTrailsPass } from './passes/missionTrailsPass';
import { missionTrailsFadeRows } from './present/missionTrailsFadeRows';
import { missionTrailsSettingsRow } from './ui/missionTrailsSettingsRow';
import { missionsLayerExhibits } from './exhibits/exhibits';

export const missionsLayer = defineLayer({
  name: 'missions',
  settings: missionsLayerSettings,
  sagas: [loadSpacecraftTracksSaga],
  exhibits: missionsLayerExhibits,
  create,
  destroy,
  passes: (runtime) => [missionTrailsPass(runtime)],
  fades: missionTrailsFadeRows,
  ui: [{ slot: 'labelsAndGuides', content: missionTrailsSettingsRow }],
});

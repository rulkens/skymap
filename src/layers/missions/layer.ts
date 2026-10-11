/**
 * The missions Layer: the sampled craft's (Voyager's) trails. Its `missionTrails`
 * settings cluster stays core's: the exhibit sagas read and take its `emphasis`, and
 * nothing under `src/state` may import a Layer.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { create } from './create';
import { destroy } from './destroy';
import { missionTrailsPass } from './passes/missionTrailsPass';
import { missionTrailsFadeRows } from './present/missionTrailsFadeRows';
import { missionTrailsSettingsRow } from './ui/missionTrailsSettingsRow';

export const missionsLayer = defineLayer({
  name: 'missions',
  create,
  destroy,
  passes: (runtime) => [missionTrailsPass(runtime)],
  fades: missionTrailsFadeRows,
  ui: [{ slot: 'labelsAndGuides', content: missionTrailsSettingsRow }],
});

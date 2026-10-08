/**
 * The lightTime Layer: faint Earth-centred spheres at light-travel distances
 * (1 light-second … 1 billion light-years) — one renderer, one pass, one fade
 * row and a toggle row in "Labels & guides".
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { lightTimeLayerSettings } from './state/slices';
import { create } from './create';
import { destroy } from './destroy';
import { lightTimeSpheresPass } from './passes/lightTimeSpheresPass';
import { lightTimeFadeRows } from './present/lightTimeFadeRows';
import { lightTimeSettingsRow } from './ui/lightTimeSettingsRow';

export const lightTimeLayer = defineLayer({
  name: 'lightTime',
  settings: lightTimeLayerSettings,
  create,
  destroy,
  passes: (runtime) => [lightTimeSpheresPass(runtime)],
  fades: lightTimeFadeRows,
  ui: [{ slot: 'labelsAndGuides', content: lightTimeSettingsRow }],
});

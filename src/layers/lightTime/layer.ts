/**
 * The lightTime Layer: faint Earth-centred spheres at light-travel distances.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { lightTimeLayerSettings } from './state/slices';
import { create } from './create';
import { destroy } from './destroy';
import { lightTimeSpheresPass } from './passes/lightTimeSpheresPass';
import { lightTimeFadeRows } from './present/lightTimeFadeRows';
import { produceLightTimeCaptions } from './present/produceLightTimeCaptions';
import { lightTimeSettingsRow } from './ui/lightTimeSettingsRow';

export const lightTimeLayer = defineLayer({
  name: 'lightTime',
  settings: lightTimeLayerSettings,
  create,
  destroy,
  passes: (runtime) => [lightTimeSpheresPass(runtime)],
  fades: lightTimeFadeRows,
  guides: () => ({
    screenLabels: [
      { slab: NEAR0, id: 'lightTimeCaptions', produceLabels: produceLightTimeCaptions },
    ],
  }),
  ui: [{ slot: 'labelsAndGuides', content: lightTimeSettingsRow }],
});

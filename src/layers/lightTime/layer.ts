/**
 * The lightTime Layer: faint Earth-centred spheres at light-travel distances.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { lightTimeLayerSettings } from './state/slices';
import { lightTimeVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { lightTimeSpheresPass } from './passes/lightTimeSpheresPass';
import { produceLightTimeCaptions } from './present/produceLightTimeCaptions';
import { lightTimeSettingsRow } from './ui/lightTimeSettingsRow';

export const lightTimeLayer = defineLayer({
  name: 'lightTime',
  settings: lightTimeLayerSettings,
  visibility: lightTimeVisibility,
  create,
  destroy,
  passes: (runtime) => [lightTimeSpheresPass(runtime)],
  guides: () => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'lightTimeCaptions',
        label: 'lightTime',
        produceLabels: produceLightTimeCaptions,
      },
    ],
  }),
  ui: [{ slot: 'labelsAndGuides', content: lightTimeSettingsRow }],
});

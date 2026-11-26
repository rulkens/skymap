/**
 * The lightTime Layer: faint Earth-centred spheres at light-travel distances.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { lightTimeLayerSettings } from './state/slices';
import { lightTimeVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { lightTimeSpheresPass } from './spheres/passes/lightTimeSpheresPass';
import { lightTimeLabelSource } from './spheres/present/lightTimeLabelSource';

export const lightTimeLayer = defineLayer({
  name: 'lightTime',
  settings: lightTimeLayerSettings,
  visibility: lightTimeVisibility,
  create,
  destroy,
  passes: (runtime) => [lightTimeSpheresPass(runtime)],
  guides: () => ({ screenLabels: [lightTimeLabelSource()] }),
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'lightTime', label: 'Light-time spheres' } }],
});

/**
 * The cosmic horizon Layer: a translucent shell at the comoving particle horizon that
 * fades in with pull-back, and the Observable Universe exhibit that frames it.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { cosmicHorizonLayerSettings } from './state/slices';
import { cosmicHorizonVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { horizonShellPass } from './passes/horizonShellPass';
import { cosmicHorizonLayerExhibits } from './exhibits/exhibits';

export const cosmicHorizonLayer = defineLayer({
  name: 'cosmicHorizon',
  settings: cosmicHorizonLayerSettings,
  visibility: cosmicHorizonVisibility,
  create,
  destroy,
  passes: (runtime) => [horizonShellPass(runtime)],
  exhibits: cosmicHorizonLayerExhibits,
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'cosmicHorizon', label: 'Universe horizon' } },
  ],
});

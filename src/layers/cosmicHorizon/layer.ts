/**
 * The cosmic horizon Layer: a translucent shell at the comoving particle horizon that
 * fades in with pull-back, and the Observable Universe exhibit that frames it.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { create } from './create';
import { destroy } from './destroy';
import { horizonShellPass } from './passes/horizonShellPass';
import { cosmicHorizonLayerExhibits } from './exhibits/exhibits';

export const cosmicHorizonLayer = defineLayer({
  name: 'cosmicHorizon',
  create,
  destroy,
  passes: (runtime) => [horizonShellPass(runtime)],
  exhibits: cosmicHorizonLayerExhibits,
});

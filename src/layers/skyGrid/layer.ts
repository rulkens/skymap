/**
 * The skyGrid Layer: equatorial, ecliptic, galactic and supergalactic
 * coordinate grids on the sky — one renderer, one pass, its settings and its
 * Labels & Guides switch.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { skyGridLayerSettings } from './state/slices';
import { skyGridVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { skyGridPass } from './passes/skyGridPass';

export const skyGridLayer = defineLayer({
  name: 'skyGrid',
  settings: skyGridLayerSettings,
  visibility: skyGridVisibility,
  create,
  destroy,
  passes: (runtime) => [skyGridPass(runtime)],
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'skyGrid', label: 'Coordinate grids' } }],
});

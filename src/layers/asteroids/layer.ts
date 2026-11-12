/**
 * The asteroids Layer: every numbered minor planet as an apparent-magnitude point, positioned by
 * two-body Kepler (docs/superpowers/specs/2026-11-12-asteroids-layer-design.md).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { asteroidsLayerSettings } from './state/slices';
import { asteroidsVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { asteroidsAssetRows } from './catalog/load/asteroidsAssetRows';
import { asteroidKeplerCompute } from './kepler/computes/asteroidKeplerCompute';
import { asteroidsPass } from './points/passes/asteroidsPass';
import AsteroidsSectionContainer from './controls/ui/AsteroidsSectionContainer';

export const asteroidsLayer = defineLayer({
  name: 'asteroids',
  settings: asteroidsLayerSettings,
  visibility: asteroidsVisibility,
  create,
  destroy,
  computes: (runtime) => [asteroidKeplerCompute(runtime)],
  passes: (runtime) => [asteroidsPass(runtime)],
  assets: asteroidsAssetRows,
  ui: [{ slot: 'main', content: AsteroidsSectionContainer, title: 'Asteroids' }],
});

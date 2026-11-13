/**
 * The asteroids Layer: every numbered minor planet as an apparent-magnitude point, positioned by
 * two-body Kepler, and the selected one's orbit ring (docs/superpowers/specs/2026-11-12-asteroids-layer-design.md).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { asteroidsLayerSettings } from './state/slices';
import { asteroidsVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { asteroidsAssetRows } from './catalog/load/asteroidsAssetRows';
import { asteroidKeplerCompute } from './kepler/computes/asteroidKeplerCompute';
import { asteroidsPass } from './points/passes/asteroidsPass';
import { asteroidOrbitsPass } from './orbits/passes/asteroidOrbitsPass';
import { asteroidsSelectionRow } from './selection/asteroidsSelectionRow';
import { asteroidsSelectionKinds } from './selection/kinds';
import { asteroidsSearch } from './focus/present/asteroidsSearch';
import AsteroidsSectionContainer from './controls/ui/AsteroidsSectionContainer';
import AsteroidTuningSectionContainer from './controls/ui/AsteroidTuningSectionContainer';
import AsteroidDetailCard from './focus/ui/AsteroidDetailCard/AsteroidDetailCard';
import CompactAsteroidCard from './focus/ui/CompactAsteroidCard/CompactAsteroidCard';
import type { AsteroidsFacts } from './@types/AsteroidsFacts';

export const asteroidsLayer = defineLayer({
  name: 'asteroids',
  settings: asteroidsLayerSettings,
  visibility: asteroidsVisibility,
  facts: { catalogReady: false } as AsteroidsFacts,
  create,
  destroy,
  computes: (runtime) => [asteroidKeplerCompute(runtime)],
  passes: (runtime) => [asteroidsPass(runtime), asteroidOrbitsPass(runtime)],
  assets: asteroidsAssetRows,
  selection: {
    kinds: asteroidsSelectionKinds,
    rows: (runtime) => [asteroidsSelectionRow(runtime)],
  },
  search: (runtime) => asteroidsSearch(runtime),
  ui: [
    { slot: 'main', content: AsteroidsSectionContainer, title: 'Asteroids' },
    { slot: 'debug', content: AsteroidTuningSectionContainer },
    {
      slot: 'detailCard',
      content: { type: 'asteroid', Detail: AsteroidDetailCard, Compact: CompactAsteroidCard },
    },
  ],
});

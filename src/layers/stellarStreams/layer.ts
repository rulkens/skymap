/**
 * The Stellar Streams Layer — PROTOTYPE: tidal debris of disrupted satellites
 * and globulars (galstreams tracks + a particle-spray Sagittarius), as additive
 * streak particles around the Milky Way.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { stellarStreamsLayerSettings } from './state/slices';
import { stellarStreamsVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { stellarStreamsPlanner } from './frame';
import { stellarStreamsPass } from './streaks/passes/stellarStreamsPass';

export const stellarStreamsLayer = defineLayer({
  name: 'stellarStreams',
  settings: stellarStreamsLayerSettings,
  visibility: stellarStreamsVisibility,
  create,
  destroy,
  planners: (runtime) => [stellarStreamsPlanner(runtime)],
  passes: (runtime) => [stellarStreamsPass(runtime)],
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'stellarStreams', label: 'Stellar streams' } },
  ],
});

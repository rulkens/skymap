/**
 * The Stellar Streams Layer: tidal debris of disrupted satellites and globulars (galstreams
 * tracks and an N-body Sagittarius), as additive streak particles around the Milky Way.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { stellarStreamsLayerSettings } from './state/slices';
import { stellarStreamsVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { stellarStreamsPlanner } from './frame';
import { stellarStreamsAssetRows } from './catalog/load/stellarStreamsAssetRows';
import { stellarStreamsPass } from './streaks/passes/stellarStreamsPass';
import StellarStreamsTuningSectionContainer from './streaks/ui/StellarStreamsTuningSectionContainer';

export const stellarStreamsLayer = defineLayer({
  name: 'stellarStreams',
  settings: stellarStreamsLayerSettings,
  visibility: stellarStreamsVisibility,
  create,
  destroy,
  planners: (runtime) => [stellarStreamsPlanner(runtime)],
  passes: (runtime) => [stellarStreamsPass(runtime)],
  assets: stellarStreamsAssetRows,
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'stellarStreams', label: 'Stellar streams' } },
    { slot: 'debug', content: StellarStreamsTuningSectionContainer },
  ],
});

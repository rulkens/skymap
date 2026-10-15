/**
 * The Stellar Streams Layer — PROTOTYPE: tidal debris of disrupted satellites
 * and globulars (galstreams tracks + a particle-spray Sagittarius), as additive
 * streak particles around the Milky Way.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { create } from './create';
import { destroy } from './destroy';
import { stellarStreamsPlanner } from './frame';
import { stellarStreamsPass } from './passes/stellarStreamsPass';

export const stellarStreamsLayer = defineLayer({
  name: 'stellarStreams',
  create,
  destroy,
  planners: (runtime) => [stellarStreamsPlanner(runtime)],
  passes: (runtime) => [stellarStreamsPass(runtime)],
});

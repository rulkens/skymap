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
import { STELLAR_STREAMS_HAZE_TARGET } from './streaks/render/stellarStreamsHazeTarget';
import { stellarStreamsHazePass } from './streaks/passes/stellarStreamsHazePass';
import { stellarStreamsHazeUpsamplePass } from './streaks/passes/stellarStreamsHazeUpsamplePass';
import { stellarStreamsPass } from './streaks/passes/stellarStreamsPass';
import StellarStreamsTuningSectionContainer from './streaks/ui/StellarStreamsTuningSectionContainer';
import StellarStreamDetailCard from './selection/ui/StellarStreamDetailCard/StellarStreamDetailCard';
import CompactStellarStreamCard from './selection/ui/CompactStellarStreamCard/CompactStellarStreamCard';
import { stellarStreamsSelectionRow } from './selection/stellarStreamsSelectionRow';
import { stellarStreamsSelectionKinds } from './selection/kinds';
import { stellarStreamsSearchRows } from './search/present/stellarStreamsSearchRows';
import { produceStellarStreamLabels } from './labels/present/produceStellarStreamLabels';
import { NEAR0 } from '../../services/engine/frame/slabs';

export const stellarStreamsLayer = defineLayer({
  name: 'stellarStreams',
  settings: stellarStreamsLayerSettings,
  visibility: stellarStreamsVisibility,
  targets: [STELLAR_STREAMS_HAZE_TARGET],
  create,
  destroy,
  planners: (runtime) => [stellarStreamsPlanner(runtime)],
  passes: (runtime) => [
    stellarStreamsHazePass(runtime),
    stellarStreamsHazeUpsamplePass(runtime),
    stellarStreamsPass(runtime),
  ],
  assets: stellarStreamsAssetRows,
  selection: {
    kinds: stellarStreamsSelectionKinds,
    rows: (runtime) => [stellarStreamsSelectionRow(runtime)],
  },
  search: (runtime) => stellarStreamsSearchRows(runtime),
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'stellarStreamLabels',
        label: 'stellarStream',
        produceLabels: produceStellarStreamLabels(runtime),
      },
    ],
  }),
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'stellarStreams', label: 'Stellar streams' } },
    { slot: 'debug', content: StellarStreamsTuningSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'stellarStream',
        Detail: StellarStreamDetailCard,
        Compact: CompactStellarStreamCard,
      },
    },
  ],
});

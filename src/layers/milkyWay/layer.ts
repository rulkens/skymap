/**
 * The milkyWay Layer: the v1 sprite Milky Way — the generated point cloud,
 * its two-pass renderer, the `mw-aggregate` target and its upsample, the
 * star-count reconcile, the three draw/pick passes, both fade rows, the
 * "You are here" COSMO label, the selection row, the source entry, the
 * DebugPanel tuning section, the InfoCard detail cards and the tier re-seed.
 */

import { createElement } from 'react';
import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO } from '../../services/engine/frame/slabs';
import { milkyWayLayerSettings } from './state/slices';
import { MILKY_WAY_SOURCE_ROWS } from './sources/milkyWaySourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { milkyWayPlanner } from './frame';
import { MILKY_WAY_AGGREGATE_TARGET } from './render/milkyWayAggregateTarget';
import { milkyWayAggregatePass } from './passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from './passes/milkyWayUpsamplePass';
import { milkyWayPass } from './passes/milkyWayPass';
import { milkyWayFadeRows } from './present/milkyWayFadeRows';
import { produceMilkyWayLabel } from './present/produceMilkyWayLabel';
import { milkyWaySelectionRow } from './present/milkyWaySelectionRow';
import { reseedMilkyWayStarCountSaga } from './sagas/reseedMilkyWayStarCountSaga';
import MilkyWayTuningSectionContainer from './ui/MilkyWayTuningSectionContainer';
import MilkyWayDetailCard from './ui/MilkyWayDetailCard/MilkyWayDetailCard';
import CompactMilkyWayCard from './ui/CompactMilkyWayCard/CompactMilkyWayCard';

export const milkyWayLayer = defineLayer({
  name: 'milkyWay',
  settings: milkyWayLayerSettings,
  sources: MILKY_WAY_SOURCE_ROWS,
  targets: [MILKY_WAY_AGGREGATE_TARGET],
  create,
  destroy,
  planners: (runtime) => [milkyWayPlanner(runtime)],
  passes: (runtime) => [
    milkyWayAggregatePass(runtime),
    milkyWayUpsamplePass(runtime),
    milkyWayPass(runtime),
  ],
  fades: milkyWayFadeRows,
  guides: () => ({
    screenLabels: [{ slab: COSMO, id: 'milkyWayLabel', produceLabels: produceMilkyWayLabel }],
  }),
  selection: () => [milkyWaySelectionRow()],
  sagas: [reseedMilkyWayStarCountSaga],
  ui: [
    { slot: 'debug', content: MilkyWayTuningSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'milkyWay',
        Detail: ({ target, pinned, chrome, onFocus, onClose }) =>
          createElement(MilkyWayDetailCard, { target, pinned, chrome, onFocus, onClose }),
        Compact: ({ target }) => createElement(CompactMilkyWayCard, { target }),
      },
    },
  ],
});

/**
 * The milkyWay Layer: the v1 sprite Milky Way — the generated point cloud,
 * its two-pass renderer, the `mw-aggregate` target and its upsample, the
 * star-count reconcile, the three draw/pick passes, its show and label entries, the
 * "You are here" COSMO label, the selection row, the source entry, the
 * DebugPanel tuning section, the InfoCard detail cards and the tier re-seed.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { COSMO } from '../../services/engine/frame/slabs';
import { milkyWayLayerSettings } from './state/slices';
import { milkyWayVisibility } from './visibility';
import { MILKY_WAY_SOURCE_ROWS } from './sources/milkyWaySourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { milkyWayPlanner } from './frame';
import { MILKY_WAY_AGGREGATE_TARGET } from './cloud/render/milkyWayAggregateTarget';
import { milkyWayAggregatePass } from './cloud/passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from './cloud/passes/milkyWayUpsamplePass';
import { milkyWayPass } from './cloud/passes/milkyWayPass';
import { produceMilkyWayLabel } from './card/present/produceMilkyWayLabel';
import { milkyWaySelectionRow } from './selection/milkyWaySelectionRow';
import { milkyWaySelectionKinds } from './selection/kinds';
import { milkyWaySearch } from './card/present/milkyWaySearch';
import { reseedMilkyWayStarCountSaga } from './tuning/sagas/reseedMilkyWayStarCountSaga';
import MilkyWayTuningSectionContainer from './tuning/ui/MilkyWayTuningSectionContainer';
import MilkyWayDetailCard from './card/ui/MilkyWayDetailCard/MilkyWayDetailCard';
import CompactMilkyWayCard from './card/ui/CompactMilkyWayCard/CompactMilkyWayCard';

export const milkyWayLayer = defineLayer({
  name: 'milkyWay',
  settings: milkyWayLayerSettings,
  visibility: milkyWayVisibility,
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
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: COSMO,
        id: 'milkyWayLabel',
        label: 'milkyWay',
        produceLabels: produceMilkyWayLabel(runtime.pickCode),
      },
    ],
  }),
  selection: {
    kinds: milkyWaySelectionKinds,
    rows: (runtime) => [milkyWaySelectionRow(runtime.pickCode)],
  },
  search: () => milkyWaySearch(),
  sagas: [reseedMilkyWayStarCountSaga],
  ui: [
    { slot: 'debug', content: MilkyWayTuningSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'milkyWay',
        Detail: MilkyWayDetailCard,
        Compact: CompactMilkyWayCard,
      },
    },
  ],
});

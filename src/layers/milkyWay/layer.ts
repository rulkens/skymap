/**
 * The milkyWay Layer: the v1 sprite Milky Way — the generated point cloud,
 * its two-pass renderer, the `mw-aggregate` target and its upsample, the
 * star-count reconcile, and the three draw/pick passes. Settings only so
 * far; fades, the label, selection and UI join in later plan tasks.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { milkyWayLayerSettings } from './state/slices';
import { create } from './create';
import { destroy } from './destroy';
import { milkyWayPlanner } from './frame';
import { MILKY_WAY_AGGREGATE_TARGET } from './render/milkyWayAggregateTarget';
import { milkyWayAggregatePass } from './passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from './passes/milkyWayUpsamplePass';
import { milkyWayPass } from './passes/milkyWayPass';

export const milkyWayLayer = defineLayer({
  name: 'milkyWay',
  settings: milkyWayLayerSettings,
  targets: [MILKY_WAY_AGGREGATE_TARGET],
  create,
  destroy,
  planners: (runtime) => [milkyWayPlanner(runtime)],
  passes: (runtime) => [
    milkyWayAggregatePass(runtime),
    milkyWayUpsamplePass(runtime),
    milkyWayPass(runtime),
  ],
});

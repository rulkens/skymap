/**
 * The flow Layer: the CF4++ peculiar-velocity ribbon field — one renderer,
 * one compute row, one pass, one asset slot, one show entry, one source, and
 * both its Settings and Debug panel sections.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { flowLayerSettings } from './state/slices';
import { flowVisibility } from './visibility';
import { FLOW_SOURCE_ROWS } from './sources/flowSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { flowPlanner } from './frame';
import { flowAssetRows } from './streamlines/load/flowAssetRows';
import { flowFieldPass } from './streamlines/passes/flowFieldPass';
import { flowCompute } from './streamlines/computes/flowCompute';
import FlowSectionContainer from './streamlines/ui/FlowSectionContainer';
import FlowTuningSectionContainer from './streamlines/ui/FlowTuningSectionContainer';

export const flowLayer = defineLayer({
  name: 'flow',
  settings: flowLayerSettings,
  visibility: flowVisibility,
  sources: FLOW_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [flowFieldPass(runtime)],
  computes: (runtime) => [flowCompute(runtime)],
  assets: flowAssetRows,
  planners: (runtime) => [flowPlanner(runtime)],
  ui: [
    { slot: 'main', content: FlowSectionContainer },
    { slot: 'debug', content: FlowTuningSectionContainer },
  ],
});

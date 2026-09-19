/**
 * The flow Layer: the CF4++ peculiar-velocity ribbon field — one renderer,
 * one compute row, one pass, one asset slot, one fade row, one source, and
 * both its Settings and Debug panel sections.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { flowLayerSettings } from './settings/flowLayerSettings';
import { FLOW_SOURCE_ROWS } from './sources/flowSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { frame } from './frame';
import { flowAssetRows } from './load/flowAssetRows';
import { flowFieldPass } from './passes/flowFieldPass';
import { flowCompute } from './computes/flowCompute';
import { flowFadeRows } from './present/flowFadeRows';
import FlowSectionContainer from './ui/FlowSectionContainer';
import FlowTuningSectionContainer from './ui/FlowTuningSectionContainer';

export const flowLayer = defineLayer({
  name: 'flow',
  // A fragment listed here may not also sit in `UNFORMED_SETTINGS_FRAGMENTS`:
  // the reducer-key uniqueness assert throws at import (Ruling 15).
  settings: flowLayerSettings,
  sources: FLOW_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [flowFieldPass(runtime)],
  computes: (runtime) => [flowCompute(runtime)],
  assets: flowAssetRows,
  fades: flowFadeRows,
  frame,
  ui: [
    { slot: 'main', content: FlowSectionContainer },
    { slot: 'debug', content: FlowTuningSectionContainer },
  ],
});

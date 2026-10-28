/** The Layer's one asset row: demand only; the velocity cube is one tier-agnostic `.scfd`. */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { FlowRuntime } from '../@types/FlowRuntime';

export function flowAssetRows(runtime: FlowRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'flow',
      slot: runtime.slot,
      req: () => undefined,
      demand: (ctx) => ctx.settings.flow.enabled,
      priority: 81, // same rung as filaments, behind them by size
      gates: 'flow',
    },
  ];
}

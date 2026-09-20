/**
 * The Layer's one asset row — demand only, no request shape (the velocity
 * cube ships as one tier-agnostic `.scfd`). `factory` hands back the slot
 * `create` already minted, so core folds this over its own rows (Ruling 10)
 * without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { FlowRuntime } from '../@types/FlowRuntime';

export function flowAssetRows(runtime: FlowRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'flow',
      factory: () => runtime.slot,
      req: () => undefined,
      demand: (ctx) => ctx.settings.flow.enabled,
      priority: 81, // same rung as filaments, behind them by size
    },
  ];
}

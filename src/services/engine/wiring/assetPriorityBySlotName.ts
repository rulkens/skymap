/**
 * assetPriorityBySlotName: the composed rows' authored fetch ranks keyed by the
 * slot NAMES the debug panel renders (`'glade-points'`, ...). Wiring rows are keyed
 * by `AssetKey`, nothing static relates the two, so the join runs through each
 * row's own `slot` and takes `EngineState`. The rank is the AUTHORED one (lower
 * fetches first), not the negation `reevaluateDemand` hands the queue. Slots with
 * no row (DEV fixtures) are absent: "unranked".
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';

export function assetPriorityBySlotName(
  state: Pick<EngineState, 'assetRows'>,
): ReadonlyMap<string, number> {
  return new Map(state.assetRows.map((row) => [row.slot.name, row.priority]));
}

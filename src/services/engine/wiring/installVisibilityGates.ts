/**
 * Every notification from a gating slot recomputes its one identity's target (and its `of`
 * labels'). A level read, not an edge: a commit raises it, `release()` (which notifies `idle`)
 * lowers it, and a reload over a committed value finds the target already held.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { gateIdentityOf } from '../../../utils/visibility/gateIdentityOf';
import { slotFor } from './slotFor';
import { syncVisibilityTarget } from './syncVisibilityTarget';

export function installVisibilityGates(state: EngineState): void {
  for (const row of state.assetRows) {
    if (row.gates === undefined) continue;
    const id = gateIdentityOf(row.gates);
    slotFor(state, row.key)?.subscribe(() => syncVisibilityTarget(state, id));
  }
}

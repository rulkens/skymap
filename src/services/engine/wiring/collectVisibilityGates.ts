/**
 * The slot behind each gated fade identity, from the composed asset rows' `gates`. Two rows
 * gating one identity, or a gating row with no slot, throw at boot: either would leave a
 * thing's presence answered by the wrong slot, or by none.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VisibilityGates } from '../../../@types/engine/state/VisibilityGates';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import { fadeIdentityKey } from '../../../utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../utils/visibility/gateIdentityOf';
import { slotFor } from './slotFor';

export function collectVisibilityGates(state: EngineState): VisibilityGates {
  const gates = new Map<string, AssetSlot<unknown, unknown>>();
  for (const row of state.assetRows) {
    if (row.gates === undefined) continue;
    const key = fadeIdentityKey(gateIdentityOf(row.gates));
    const slot = slotFor(state, row.key);
    if (slot === undefined) throw new Error(`collectVisibilityGates: '${key}' has no slot`);
    if (gates.has(key)) throw new Error(`collectVisibilityGates: two rows gate '${key}'`);
    gates.set(key, slot);
  }
  return gates;
}

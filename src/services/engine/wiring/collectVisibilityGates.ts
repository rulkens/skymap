/**
 * The slot behind each gated fade identity, from the composed asset rows' `gates`. Two rows
 * gating one identity throw at boot: that would leave a thing's presence answered by the
 * wrong slot.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VisibilityGates } from '../../../@types/engine/state/VisibilityGates';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import { fadeIdentityKey } from '../../../utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../utils/visibility/gateIdentityOf';

export function collectVisibilityGates(state: EngineState): VisibilityGates {
  const gates = new Map<string, AssetSlot<unknown, unknown>>();
  for (const row of state.assetRows) {
    if (row.gates === undefined) continue;
    const key = fadeIdentityKey(gateIdentityOf(row.gates));
    if (gates.has(key)) throw new Error(`collectVisibilityGates: two rows gate '${key}'`);
    gates.set(key, row.slot);
  }
  return gates;
}

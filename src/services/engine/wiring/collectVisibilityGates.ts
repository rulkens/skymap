/**
 * The slots behind each gated fade identity, from the composed asset rows' `gates`. Several
 * rows may gate one identity when they are alternative loads of one thing (a galaxy source's
 * flat files or its octree): the identity is present while any of them holds a committed
 * value. A gating row with no slot throws at boot, since nothing could ever answer for it.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VisibilityGates } from '../../../@types/engine/state/VisibilityGates';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import { fadeIdentityKey } from '../../../utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../utils/visibility/gateIdentityOf';
import { slotFor } from './slotFor';

export function collectVisibilityGates(state: EngineState): VisibilityGates {
  const slots = new Map<string, Pick<AssetSlot<unknown, unknown>, 'committed'>[]>();
  for (const row of state.assetRows) {
    if (row.gates === undefined) continue;
    const key = fadeIdentityKey(gateIdentityOf(row.gates));
    const slot = slotFor(state, row.key);
    if (slot === undefined) throw new Error(`collectVisibilityGates: '${key}' has no slot`);
    slots.set(key, [...(slots.get(key) ?? []), slot]);
  }
  return new Map(
    [...slots].map(([key, list]) => [
      key,
      { committed: () => list.map((s) => s.committed()).find((c) => c !== null) ?? null },
    ]),
  );
}

/**
 * reanchorWrites — the writes that keep each selection slot on the thing its
 * durable id names after a reload moved row indices. `pending` waits (a
 * reloading asset still answers from its committed data), `absent` clears, a
 * hit writes only when the ref moved: every focus write is an action the camera
 * reacts to, so an unchanged ref must issue none. Assumes decode(encode(ref))
 * is that ref; a cross-catalog duplicate settles on its first write.
 */
import { shallowEqualRef } from '../object/shallowEqualRef';
import type { FocusResolution } from '../../@types/engine/selection/FocusResolution';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { SelectionSlotWrite } from '../../@types/engine/selection/SelectionSlotWrite';

export function reanchorWrites(
  ids: Readonly<Record<SelectionSlot, string | null>>,
  refs: Readonly<Record<SelectionSlot, SelectionRefBase | null>>,
  resolve: (id: string) => FocusResolution,
): readonly SelectionSlotWrite[] {
  const writes: SelectionSlotWrite[] = [];
  for (const slot of Object.keys(ids) as SelectionSlot[]) {
    const id = ids[slot];
    if (id === null) continue;
    const resolution = resolve(id);
    if (resolution.kind === 'pending') continue;
    const ref = resolution.kind === 'hit' ? resolution.ref : null;
    if (!shallowEqualRef(ref, refs[slot])) writes.push({ slot, ref });
  }
  return writes;
}

/**
 * installFormatVersionAlert — mirrors `installSlotReadyWake`: one
 * subscription per slot in `allSlots`. A stale `.bin` fails every family at
 * once, so `alerted` is a closure-local once-guard (fresh per install call,
 * not module state) fanning every matching slot into a single dispatch.
 */

import { FormatVersionError } from '../../../data/formatVersionError';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineStatus } from '../../../@types/engine/EngineStatus';

export function installFormatVersionAlert(
  dispatch: (status: EngineStatus) => void,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void {
  let alerted = false;

  for (const [, slot] of allSlots) {
    slot.subscribe((s) => {
      if (alerted || s.kind !== 'error' || !(s.error instanceof FormatVersionError)) return;
      alerted = true;
      dispatch({ kind: 'error', message: s.error.message, cause: 'format-version' });
    });
  }
}

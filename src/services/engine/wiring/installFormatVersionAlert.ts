/**
 * installFormatVersionAlert — mirrors `installSlotReadyWake`: one
 * subscription per slot in `allSlots`. A stale `.bin` fails every family at
 * once, so `alerted` is a closure-local once-guard (fresh per install call,
 * not module state) fanning every matching slot into one alert, dispatched
 * as two actions: the status (for StatusBar/useSplash) and `reopenSplash()`
 * — a returning visitor's `seenVersion` already hid the splash, so the error
 * copy needs the reopen to reach them at all.
 */

import { FormatVersionError } from '../../../data/formatVersionError';
import { engineStatusChanged } from '../../../state/engine/engineSlice';
import { reopenSplash } from '../../../state/ui/uiSlice';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AppDispatch } from '../../../store/types';

export function installFormatVersionAlert(
  dispatch: AppDispatch,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void {
  let alerted = false;

  for (const [, slot] of allSlots) {
    slot.subscribe((s) => {
      if (alerted || s.kind !== 'error' || !(s.error instanceof FormatVersionError)) return;
      alerted = true;
      dispatch(
        engineStatusChanged({ kind: 'error', message: s.error.message, cause: 'format-version' }),
      );
      dispatch(reopenSplash());
    });
  }
}

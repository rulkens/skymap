/**
 * installFormatVersionAlert — subscribe every asset slot to surface a
 * decoder/data version mismatch as a splash-visible error.
 *
 * Mirrors `installSlotReadyWake` (same file, same shape): one subscription
 * per slot in `allSlots`, absorbed here rather than scattered across every
 * slot factory. `allSlots` is the complete enumeration built by
 * `installLoadProgress`, so "every slot that can fail" is covered in one
 * enforcement site.
 *
 * A stale `.bin` (last built before this decoder's format version landed)
 * fails EVERY family at once — SDSS, 2MRS, GLADE all decode the same on-disk
 * bytes with the same outdated version stamp. Without the once-guard this
 * would fire one dispatch per catalog; `alerted` is scoped to the install
 * call (a fresh closure per `wireSlots` run), not module-level state that
 * would leak between engine instances or tests.
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

/**
 * installFadeOnArrival — core's arrival edge, so no slot factory and no Layer drives
 * a fade by hand. The edge is a row guard's false→true TRANSITION, never a level
 * check: `applyIntent` runs the row's non-idempotent `post` whenever the guard
 * passes, and `slot.cancel()` re-notifies subscribers with the last `ready` state.
 */

import { syncVisibilityFadeItem } from './syncVisibilityFades';

import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';

export function installFadeOnArrival(
  state: EngineState,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void {
  const openByRow = new Map<VisibilityLayerKey, Map<unknown, boolean>>();

  const pass = (drive: boolean): void => {
    for (const row of state.fadeRows) {
      // No guard means no transition is expressible; no intent means nothing to drive.
      if (row.intent === undefined || row.guard === undefined) continue;

      let open = openByRow.get(row.key);
      if (open === undefined) {
        open = new Map<unknown, boolean>();
        openByRow.set(row.key, open);
      }

      for (const item of row.expand(state)) {
        const now = row.guard(state, item);
        const opened = now && open.get(item) !== true;
        // Written on every pass, not just on opens: the install pass is the baseline,
        // and a guard that closes is only ever noticed at the next `ready`.
        open.set(item, now);
        if (drive && opened) syncVisibilityFadeItem(state, row.key, item);
      }
    }
  };

  // The snapshot must predate any subscription: an asset already committed at
  // bootstrap has no arrival edge left to fire.
  pass(false);

  for (const [, slot] of allSlots) {
    slot.subscribe((s) => {
      if (s.kind === 'ready') pass(true);
    });
  }
}

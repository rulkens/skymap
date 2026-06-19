/**
 * persistSplashVersion — thin localStorage effect for splash dismiss.
 *
 * Writing `seenVersion` is a reactive CONSEQUENCE of `dismissSplash`, not
 * slice state, so it lives OUTSIDE the slice as a thin side-effect subscriber.
 * On this branch the effect is a `store.subscribe` diff on `dismissedVersion`;
 * an alternative `takeEvery(dismissSplash)` saga would also work, but the
 * reconcile-saga seam is not on this branch, so the subscription is the chosen
 * form.
 *
 * The diff-on-`dismissedVersion` (not on every dispatch) means unrelated UI
 * writes don't touch storage, and `reopenSplash` produces no write because it
 * leaves `dismissedVersion` unchanged — the subscriber fires but the diff
 * guard short-circuits.
 */

import { selectSplashDismissedVersion } from './selectors';
import { writeSeenVersion } from './splashStorage';
import type { AppStore } from '../../store/types';

/**
 * Install a store subscriber that writes `dismissedVersion` to localStorage
 * whenever it transitions to a non-null value.
 *
 * Returns the unsubscribe function (caller decides the lifetime).
 */
export function persistSplashVersion(store: AppStore): () => void {
  // Snapshot BEFORE subscribing so a returning user whose store was seeded
  // with a non-null dismissedVersion does not trigger a spurious write on
  // the first subscriber tick.
  let lastSeen = selectSplashDismissedVersion(store.getState());

  const unsubscribe = store.subscribe(() => {
    const current = selectSplashDismissedVersion(store.getState());
    if (current !== lastSeen && current !== null) {
      writeSeenVersion(current);
      lastSeen = current;
    }
    // If current === null (can't happen via reducers, but guarded for clarity),
    // skip and leave lastSeen unchanged — null is not a dismissal event.
  });

  return unsubscribe;
}

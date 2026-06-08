import type { FocusTarget } from '../camera/FocusTarget';

/**
 * Return shape for `useUrlSync` — the two pending slots the hook
 * surfaces back to the App so it can render loading banners or
 * await-data spinners.  Both are null in steady state; non-null
 * means a deep-link arrival hasn't been resolved against engine
 * data yet.
 */
export type UrlSyncReturn = {
  pendingTarget: FocusTarget | null;
  pendingStructureId: string | null;
};

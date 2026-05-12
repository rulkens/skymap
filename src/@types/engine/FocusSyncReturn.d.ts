import type { FocusTarget } from '../camera/FocusTarget';

/**
 * What `useFocusUrlSync` returns to the caller.  `pendingTarget` is
 * non-null when a deep-link arrival is waiting to be resolved against
 * the loaded clouds — currently surfaced so a future tier-mismatch
 * banner can render off it.  Other paths (success, supersede) clear it
 * internally without the caller having to act.
 */
export type FocusSyncReturn = {
  pendingTarget: FocusTarget | null;
};

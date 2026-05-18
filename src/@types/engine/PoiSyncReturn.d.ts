/**
 * What `usePoiUrlSync` returns to the caller.  `pendingPoiId` is non-
 * null when a `#poi=<id>` deep-link arrival is waiting to be resolved
 * against the loaded POI table — currently surfaced for parity with
 * `useFocusUrlSync`'s `pendingTarget` and to enable a future
 * tier-mismatch or unresolved-id banner.  Other paths (success,
 * popstate-clear) clear it internally without the caller having to act.
 */
export type PoiSyncReturn = {
  pendingPoiId: string | null;
};

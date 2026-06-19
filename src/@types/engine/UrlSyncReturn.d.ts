/**
 * UrlSyncReturn — return type for `useUrlSync`.
 *
 * The hook is a pure side-effect hook: it owns `window.location.hash`
 * and dispatches to the Redux store. No state is surfaced back to the
 * caller; callers that previously read `pendingTarget` /
 * `pendingStructureId` from here should remove those reads — the saga
 * owns resolution and deferral, and the store's focus slot is the truth.
 */
export type UrlSyncReturn = void;

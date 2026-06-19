/**
 * UseUrlSyncInput — formerly the combined input bag for `useUrlSync`.
 *
 * The hook now reads all focus state from the Redux store directly
 * (`selectFocusedFocusable`) and dispatches `requestFocus` /
 * `clearSelection` for deep-link reads. No external props are needed.
 * This type is kept as an empty alias so any lingering import compiles
 * without churn; remove it when all import sites are gone.
 */
export type UseUrlSyncInput = Record<never, never>;

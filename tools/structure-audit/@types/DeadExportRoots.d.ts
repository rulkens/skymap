/** `src` is authoritative for liveness; `others` (tests/, tools/ files, absolute) only demote to test-only. */
export type DeadExportRoots = { readonly src: string; readonly others: readonly string[] };

/**
 * What `resolveSiteLink` says about one internal link. `pending` is a link to a
 * planned page that is not built yet (allow-listed); `stale-pending` is an
 * allow-listed path that now exists, which fails so the list can only shrink.
 */
export type SiteLinkVerdict =
  | { kind: 'ok' }
  | { kind: 'skip' }
  | { kind: 'pending'; path: string }
  | { kind: 'stale-pending'; path: string }
  | { kind: 'broken'; reason: string };

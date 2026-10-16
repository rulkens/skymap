import type { DomeStatus } from './DomeStatus';
import type { RemoteSearchMatch } from './RemoteSearchMatch';

/** Dome → remote; disjoint from `RemoteMessage`, so each side drops its own echoes. */
export type DomeMessage =
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] };

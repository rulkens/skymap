import type { DomeStatus } from './DomeStatus';
import type { RemoteMenu } from './RemoteMenu';
import type { RemoteSearchMatch } from './RemoteSearchMatch';

/** Dome → remote; disjoint from `RemoteMessage`, so each side drops its own echoes. `v` is the sender's
 *  `REMOTE_PROTOCOL_VERSION`. */
export type DomeMessage = { v: number } & (
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'menu'; menu: RemoteMenu }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] }
);

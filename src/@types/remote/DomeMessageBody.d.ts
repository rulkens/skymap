import type { DomeStatus } from './DomeStatus';
import type { RemoteMenu } from './RemoteMenu';
import type { RemoteSearchMatch } from './RemoteSearchMatch';

/** What the dome says to its remotes. */
export type DomeMessageBody =
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'menu'; menu: RemoteMenu }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] };

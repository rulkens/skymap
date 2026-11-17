import type { RelayRoom } from './RelayRoom';
import type { RemoteLink } from './RemoteLink';
import type { Unsubscribe } from './Unsubscribe';

/** A dome's hosting link: the relay's room frames arrive on `onRoom`, never on `onText`. */
export type DomeLink = RemoteLink & {
  onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe;
};

import type { RelayRoom } from './RelayRoom';

/** The only text the relay itself sends; it drops remote text with a top-level `relay` key, so a host can trust it. */
export type RelayFrame = { relay: 'room' } & RelayRoom;

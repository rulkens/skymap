import type { DomeLink } from './DomeLink';
import type { RemoteLink } from './RemoteLink';
import type { RoomCode } from './RoomCode';

/** How a page reaches a relay: a dome hosts and is issued its room, a remote opens one by code. */
export type RemoteTransport = {
  host: () => DomeLink;
  open: (room: RoomCode) => RemoteLink;
};

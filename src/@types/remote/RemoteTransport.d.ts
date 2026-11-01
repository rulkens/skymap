import type { RemoteLink } from './RemoteLink';
import type { RoomCode } from './RoomCode';

/** How a page reaches a relay room; parsing and validation live above every transport. */
export type RemoteTransport = {
  /** A fresh room for this dome session, in the transport's own format. */
  newRoom: () => RoomCode;
  open: (room: RoomCode) => RemoteLink;
  /** Origins a remote can reach this dome on; the pairing QR encodes the first. A localhost page cannot learn its
   *  LAN address by itself. */
  pairingOrigins: () => Promise<readonly string[]>;
};

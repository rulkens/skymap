import type { IncomingMessage } from 'node:http';
import type { RoomCode } from '../../../src/@types/remote/RoomCode';

/** What differs between the relay's hosts (Vite dev server, desktop app); the rules are shared. */
export type RelayOptions = {
  /** The code a host gets, given the `?last=` it reconnected with. */
  codeFor: (last: RoomCode | null) => RoomCode;
  lanOrigin: () => string;
  /** Anyone who can host reads the code, so the desktop app admits loopback only. */
  mayHost: (request: IncomingMessage) => boolean;
  pairingOnSky: boolean;
  heartbeatMs?: number;
};

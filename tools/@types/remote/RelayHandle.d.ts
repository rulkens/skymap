import type { RelayRoom } from '../../../src/@types/remote/RelayRoom';
import type { RoomCode } from '../../../src/@types/remote/RoomCode';
import type { Unsubscribe } from '../../../src/@types/remote/Unsubscribe';

/** The relay's controls for the app hosting it. */
export type RelayHandle = {
  /** Kicks the old code's remotes and re-keys its host's room; the host stays connected. */
  rotate: (from: RoomCode, to: RoomCode) => void;
  onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe;
};

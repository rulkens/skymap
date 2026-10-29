import type { RoomCode } from './RoomCode';

/** This dome's pairing, a per-device report like `arrival`: `off` until the receiver saga runs (the `?remote` gate). */
export type RemoteState = {
  readonly phase: 'off' | 'waiting' | 'paired';
  readonly code: RoomCode | null;
  readonly pairingUrl: string | null;
};

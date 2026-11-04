import type { RoomCode } from '../../../../src/@types/remote/RoomCode';

/** Getters, because main owns both values: rotation and the network picker change them live. */
export type DesktopRelayOptions = { code: () => RoomCode; network: () => string | null };

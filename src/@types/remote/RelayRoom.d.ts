import type { RoomCode } from './RoomCode';

/** The room a relay issued to a host: its code, the origin a phone opens, and whether the sky shows the pairing card. */
export type RelayRoom = { code: RoomCode; origin: string; onSky: boolean };

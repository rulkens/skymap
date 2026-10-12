/** `seq` is the pool's touch count at the entry's last touch: it orders a `lastSeenFrame` tie. */
export type SlotEntry = { key: string; lastSeenFrame: number; seq: number };

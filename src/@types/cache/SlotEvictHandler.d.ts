/**
 * SlotEvictHandler — called by `SlotPool.allocate()` synchronously, after the
 * evicted key has left the key map and before the slot is overwritten, so the
 * consumer can drop its own "this key has a slot" tracking without racing a
 * second `allocate()` or drawing the new occupant under the old key.
 */
export type SlotEvictHandler = (key: string) => void;

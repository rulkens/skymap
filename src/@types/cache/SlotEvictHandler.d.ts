/**
 * SlotEvictHandler — callback invoked by `SlotPool.allocate()`
 * immediately before a slot's previous occupant is overwritten.
 *
 * Receives the evicted entry's key so callers can remove their own
 * tracking of "this key has a slot" before the slot's contents are
 * replaced (otherwise the consumer might draw a stale UV rect
 * pointing at a slot that doesn't yet contain its bitmap, briefly
 * displaying whichever galaxy now occupies that slot).
 *
 * The handler runs synchronously inside `allocate()` immediately before
 * the slot's previous occupant is overwritten; callers can safely
 * `.delete(key)` from their own maps without racing against another
 * `allocate()` call.
 */
export type SlotEvictHandler = (key: string) => void;

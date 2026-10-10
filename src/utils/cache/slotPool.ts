/**
 * SlotPool — fixed-capacity key → slot map, LRU by `lastSeenFrame`; callers
 * `touch` every frame an item is on screen to keep it alive. Asked for a new
 * key while full, it recycles the oldest slot, or refuses (null) when even
 * that slot was claimed this frame — see `allocate`.
 *
 * A slot index is a fact about the frame that produced it: an evicted key
 * leaves the map, so it comes back in a different slot. Code holding an index
 * across an await re-resolves it through `slotOf`, or writes into another key.
 */

import type { SlotEntry } from '../../@types/cache/SlotEntry';
import type { SlotEvictHandler } from '../../@types/cache/SlotEvictHandler';
import type { SlotStore } from '../../@types/cache/SlotStore';

export class SlotPool implements SlotStore {
  private readonly slots: Array<SlotEntry | undefined>;
  private readonly keyToSlot = new Map<string, number>();
  // One handler, not an array: the stream that owns the pool is its only consumer.
  private onEvict: SlotEvictHandler | undefined;

  constructor(private readonly capacity: number) {
    this.slots = new Array(capacity).fill(undefined);
  }

  /** `undefined` clears; last writer wins, which is the tear-down path. */
  setEvictHandler(handler: SlotEvictHandler | undefined): void {
    this.onEvict = handler;
  }

  /**
   * A resident key always gets its slot back; a NEW key is refused (null) only
   * when every slot carries `lastSeenFrame === frame`. Why refuse rather than
   * evict: a consumer whose demand exceeds capacity (the Earth tile planner)
   * claims every slot early in the frame and keeps asking. Evicting there
   * recycles a slot claimed this same frame, and a stationary camera
   * re-requests the same set every frame: evict, refetch, evict, forever.
   * Planners order largest-on-screen-first, so serving what fits is bounded.
   */
  allocate(key: string, frame: number): number | null {
    const touched = this.touch(key, frame);
    if (touched !== null) return touched;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] === undefined) {
        this.slots[i] = { key, lastSeenFrame: frame };
        this.keyToSlot.set(key, i);
        return i;
      }
    }
    let lruIdx = 0;
    let lruFrame = this.slots[0]!.lastSeenFrame;
    for (let i = 1; i < this.capacity; i++) {
      const f = this.slots[i]!.lastSeenFrame;
      if (f < lruFrame) {
        lruIdx = i;
        lruFrame = f;
      }
    }
    if (lruFrame === frame) return null;

    const evictedKey = this.slots[lruIdx]!.key;
    this.keyToSlot.delete(evictedKey);
    // BEFORE the overwrite, so the handler can still clear state keyed on
    // `evictedKey`; a throw must not corrupt the pool, so log and proceed.
    if (this.onEvict) {
      try {
        this.onEvict(evictedKey);
      } catch (err) {
        console.error('[SlotPool] onEvict handler threw:', err);
      }
    }
    this.slots[lruIdx] = { key, lastSeenFrame: frame };
    this.keyToSlot.set(key, lruIdx);
    return lruIdx;
  }

  /** Refresh a resident key's `lastSeenFrame`; `null` if `key` holds no slot. Never allocates. */
  touch(key: string, frame: number): number | null {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return null;
    this.slots[idx]!.lastSeenFrame = frame;
    return idx;
  }

  /** Read-only on purpose: resolving a key no longer resident must not resurrect it. */
  slotOf(key: string): number | undefined {
    return this.keyToSlot.get(key);
  }

  lastSeenFrame(key: string): number | undefined {
    const idx = this.keyToSlot.get(key);
    return idx === undefined ? undefined : this.slots[idx]!.lastSeenFrame;
  }

  occupiedCount(): number {
    return this.keyToSlot.size;
  }
}

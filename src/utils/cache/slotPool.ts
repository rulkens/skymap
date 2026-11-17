/**
 * SlotPool — fixed-capacity key → slot map, LRU by `lastSeenFrame`, ties broken
 * by touch order; callers `touch` every frame an item is on screen to keep it
 * alive. Asked for a new key while full, it recycles the oldest slot, or refuses
 * (null) when even that slot was claimed this frame — see `allocate`.
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
  private seq = 0;
  // Every resident slot's lastSeenFrame is at least this; reset when a slot is freed.
  private oldestSeenAtLeast = -Infinity;
  // One handler, not an array: a store has one owner.
  private onEvict: SlotEvictHandler | undefined;

  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.slots = new Array(capacity).fill(undefined);
  }

  /** `undefined` clears; last writer wins, which is the tear-down path. */
  setEvictHandler(handler: SlotEvictHandler | undefined): void {
    this.onEvict = handler;
  }

  /** Pure bookkeeping: nothing GPU-side to free. */
  destroy(): void {}

  /**
   * A resident key always gets its slot back; a NEW key is refused (null) only
   * when every slot was touched at or after `liveSince` (default: this frame).
   * Why refuse rather than evict: a consumer whose demand exceeds capacity (the
   * Earth tile planner) claims every slot early in the frame and keeps asking.
   * Evicting there recycles a live slot, and a stationary camera re-requests the
   * same set every frame: evict, refetch, evict, forever. A consumer that revisits
   * each key once per N frames (the decimated galaxy walk) passes `frame - N + 1`.
   * Planners order largest-on-screen-first, so serving what fits is bounded.
   */
  allocate(key: string, frame: number, liveSince = frame): number | null {
    const touched = this.touch(key, frame);
    if (touched !== null) return touched;
    if (this.keyToSlot.size < this.capacity) {
      const free = this.slots.indexOf(undefined);
      this.slots[free] = { key, lastSeenFrame: frame, seq: this.seq++ };
      this.keyToSlot.set(key, free);
      return free;
    }
    // A lower bound on every slot's stamp (touches only raise them), so a refusal
    // costs O(1) instead of a full scan per over-budget key.
    if (this.oldestSeenAtLeast >= liveSince) return null;
    let lruIdx = 0;
    let lruFrame = this.slots[0]!.lastSeenFrame;
    let lruSeq = this.slots[0]!.seq;
    for (let i = 1; i < this.capacity; i++) {
      const { lastSeenFrame: f, seq } = this.slots[i]!;
      if (f < lruFrame || (f === lruFrame && seq < lruSeq)) {
        lruIdx = i;
        lruFrame = f;
        lruSeq = seq;
      }
    }
    if (lruFrame >= liveSince) {
      this.oldestSeenAtLeast = lruFrame;
      return null;
    }

    const evictedKey = this.slots[lruIdx]!.key;
    this.keyToSlot.delete(evictedKey);
    // BEFORE the overwrite, so the handler can still clear state keyed on
    // `evictedKey`.
    this.notifyEvict(evictedKey);
    this.slots[lruIdx] = { key, lastSeenFrame: frame, seq: this.seq++ };
    this.keyToSlot.set(key, lruIdx);
    return lruIdx;
  }

  /**
   * Free `key`'s slot through the evict handler, as recycling it would; nothing for an absent
   * key. For an owner whose keys depend on each other (a chunk's descendants go with it).
   */
  evict(key: string): void {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return;
    this.keyToSlot.delete(key);
    this.slots[idx] = undefined;
    this.oldestSeenAtLeast = -Infinity;
    this.notifyEvict(key);
  }

  /** A throw must not corrupt the pool, so log and proceed. */
  private notifyEvict(key: string): void {
    if (!this.onEvict) return;
    try {
      this.onEvict(key);
    } catch (err) {
      console.error('[SlotPool] onEvict handler threw:', err);
    }
  }

  /** Refresh a resident key's `lastSeenFrame`; `null` if `key` holds no slot. Never allocates. */
  touch(key: string, frame: number): number | null {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return null;
    const entry = this.slots[idx]!;
    entry.lastSeenFrame = frame;
    entry.seq = this.seq++;
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

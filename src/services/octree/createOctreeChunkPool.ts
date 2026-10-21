/**
 * createOctreeChunkPool — the octree chunk stream's slot store: `SlotPool`'s LRU and refusal
 * rule, with each key also holding a contiguous record run from a buddy allocator, so a 2k-record
 * chunk no longer reserves a 32k stride. A key that does not fit evicts least-recently-seen keys,
 * oldest first, until a run of its size frees (no compaction: freed buddies coalesce, and the
 * planner budgets the kept set to the pool's records).
 */
import type { SlotEntry } from '../../@types/cache/SlotEntry';
import type { SlotEvictHandler } from '../../@types/cache/SlotEvictHandler';
import type { OctreeChunkPool } from '../../@types/octree/OctreeChunkPool';
import type { OctreePoolShape } from '../../@types/octree/OctreePoolShape';
import { OCTREE_MIN_RUN_RECORDS } from '../../data/octree/octreeMinRunRecords';
import { createBuddyAllocator } from '../../utils/octree/createBuddyAllocator';

export function createOctreeChunkPool(
  shape: OctreePoolShape,
  recordsOf: (key: string) => number,
): OctreeChunkPool {
  const runs = createBuddyAllocator(
    shape.records,
    shape.maxRun,
    Math.min(OCTREE_MIN_RUN_RECORDS, shape.maxRun),
  );
  const entries = new Array<(SlotEntry & { runStart: number }) | undefined>(shape.slots);
  const slotOfKey = new Map<string, number>();
  let seq = 0;
  let onEvict: SlotEvictHandler | undefined;

  const release = (key: string): void => {
    const slot = slotOfKey.get(key)!;
    slotOfKey.delete(key);
    runs.free(entries[slot]!.runStart);
    entries[slot] = undefined;
    // A throw must not corrupt the pool, so log and proceed.
    try {
      onEvict?.(key);
    } catch (err) {
      console.error('[octreeChunkPool] onEvict handler threw:', err);
    }
  };

  const touch = (key: string, frame: number): number | null => {
    const slot = slotOfKey.get(key);
    if (slot === undefined) return null;
    entries[slot]!.lastSeenFrame = frame;
    entries[slot]!.seq = seq++;
    return slot;
  };

  /** The least recently seen key, or null when it was seen this frame (or the pool is empty). */
  const evictable = (frame: number): string | null => {
    let lru: SlotEntry | undefined;
    for (const e of entries) {
      if (e === undefined) continue;
      if (lru === undefined || e.lastSeenFrame < lru.lastSeenFrame) lru = e;
      else if (e.lastSeenFrame === lru.lastSeenFrame && e.seq < lru.seq) lru = e;
    }
    return lru === undefined || lru.lastSeenFrame === frame ? null : lru.key;
  };

  return {
    allocate(key, frame) {
      const resident = touch(key, frame);
      if (resident !== null) return resident;
      const records = recordsOf(key);
      for (;;) {
        const slot = entries.findIndex((e) => e === undefined);
        const runStart = slot < 0 ? null : runs.alloc(records);
        if (runStart !== null) {
          entries[slot] = { key, lastSeenFrame: frame, seq: seq++, runStart };
          slotOfKey.set(key, slot);
          return slot;
        }
        const victim = evictable(frame);
        if (victim === null) return null;
        release(victim);
      }
    },
    touch,
    evict(key) {
      if (slotOfKey.has(key)) release(key);
    },
    slotOf: (key) => slotOfKey.get(key),
    occupiedCount: () => slotOfKey.size,
    setEvictHandler(handler) {
      onEvict = handler;
    },
    runStartOf: (slot) => entries[slot]!.runStart,
    runSize: runs.runSize,
    // Pure bookkeeping: the renderer owns the GPU buffers.
    destroy() {},
  };
}

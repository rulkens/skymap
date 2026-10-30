/**
 * createOctreeChunkPool — the octree chunk stream's slot store: `SlotPool`'s LRU and refusal
 * rule, with each key also holding a contiguous record run and a contiguous node-row run, each
 * from its own buddy allocator, so a small chunk reserves neither a 32k-record nor a 2k-row
 * stride. A key that does not fit evicts least-recently-seen keys, oldest first, until a slot and
 * both runs free (no compaction: freed buddies coalesce, and the planner budgets the kept set to
 * the pool's records and rows).
 */
import type { SlotEntry } from '../../@types/cache/SlotEntry';
import type { SlotEvictHandler } from '../../@types/cache/SlotEvictHandler';
import type { OctreeChunkPool } from '../../@types/octree/OctreeChunkPool';
import type { OctreeChunkRef } from '../../@types/octree/OctreeChunkRef';
import type { OctreeChunkRuns } from '../../@types/octree/OctreeChunkRuns';
import type { OctreePoolShape } from '../../@types/octree/OctreePoolShape';
import { createBuddyAllocator } from '../../utils/octree/createBuddyAllocator';

export function createOctreeChunkPool(
  shape: OctreePoolShape,
  sizeOf: (key: string) => Pick<OctreeChunkRef, 'records' | 'nodes'>,
): OctreeChunkPool {
  const { records, nodes } = shape;
  const recordRuns = createBuddyAllocator(records.total, records.maxRun, records.minRun);
  const nodeRuns = createBuddyAllocator(nodes.total, nodes.maxRun, nodes.minRun);
  const entries = new Array<(SlotEntry & { runs: OctreeChunkRuns }) | undefined>(shape.slots);
  const slotOfKey = new Map<string, number>();
  let seq = 0;
  let onEvict: SlotEvictHandler | undefined;

  const release = (key: string): void => {
    const slot = slotOfKey.get(key)!;
    slotOfKey.delete(key);
    recordRuns.free(entries[slot]!.runs.records);
    nodeRuns.free(entries[slot]!.runs.nodes);
    entries[slot] = undefined;
    // A throw must not corrupt the pool, so log and proceed.
    try {
      onEvict?.(key);
    } catch (err) {
      console.error('[octreeChunkPool] onEvict handler threw:', err);
    }
  };

  /** Both runs for `size`, or null with neither taken. */
  const allocRuns = (size: Pick<OctreeChunkRef, 'records' | 'nodes'>): OctreeChunkRuns | null => {
    const recordStart = recordRuns.alloc(size.records);
    if (recordStart === null) return null;
    const nodeStart = nodeRuns.alloc(size.nodes);
    if (nodeStart !== null) return { records: recordStart, nodes: nodeStart };
    recordRuns.free(recordStart);
    return null;
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
      const size = sizeOf(key);
      for (;;) {
        const slot = entries.findIndex((e) => e === undefined);
        const runs = slot < 0 ? null : allocRuns(size);
        if (runs !== null) {
          entries[slot] = { key, lastSeenFrame: frame, seq: seq++, runs };
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
    runsOf: (slot) => entries[slot]!.runs,
    recordRunSize: recordRuns.runSize,
    nodeRunSize: nodeRuns.runSize,
    // Pure bookkeeping: the renderer owns the GPU buffers.
    destroy() {},
  };
}

import type { SlotStore } from '../cache/SlotStore';

/**
 * An octree source's chunk residency: each key holds a chunk slot (its node rows) and a record
 * run sized to it. `allocate` evicts least-recently-seen keys until both fit, and refuses (null)
 * once the next in line was seen this frame.
 */
export type OctreeChunkPool = SlotStore & {
  /** Free `key`'s slot and run through the evict handler; nothing for an absent key. */
  evict(key: string): void;
  /** First record of the run behind an occupied slot, counted from the pool's first chunk record. */
  runStartOf(slot: number): number;
  /** The run `records` takes. */
  runSize(records: number): number;
};

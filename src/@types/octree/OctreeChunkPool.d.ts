import type { SlotStore } from '../cache/SlotStore';
import type { OctreeChunkRuns } from './OctreeChunkRuns';

/**
 * An octree source's chunk residency: each key holds a slot, a record run and a node-row run sized
 * to it. `allocate` evicts least-recently-seen keys until all three fit, and refuses (null) once
 * the next in line was seen this frame.
 */
export type OctreeChunkPool = SlotStore & {
  /** Free `key`'s slot and runs through the evict handler; nothing for an absent key. */
  evict(key: string): void;
  /** Where the runs behind an occupied slot start. */
  runsOf(slot: number): OctreeChunkRuns;
  /** The record run `records` takes. */
  recordRunSize(records: number): number;
  /** The node-row run `nodes` rows take. */
  nodeRunSize(nodes: number): number;
};

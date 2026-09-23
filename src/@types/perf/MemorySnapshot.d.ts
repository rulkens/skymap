import type { GpuMemorySnapshot } from '../gpu/memory/GpuMemorySnapshot';

/** `SkymapPerfHook.memory()`'s wire shape — GPU ledger totals plus Chrome's
 *  non-standard heap reading (`null` off Chrome; see `jsHeapBytes`). */
export type MemorySnapshot = {
  readonly gpu: GpuMemorySnapshot;
  readonly jsHeapBytes: number | null;
};

import type { GpuMemoryOwnerRow } from './GpuMemoryOwnerRow';

/** A `trackGpuMemory` snapshot-fn read: total live GPU bytes, and the
 *  per-owner breakdown sorted by `bytes` descending (biggest owner first). */
export type GpuMemorySnapshot = {
  readonly totalBytes: number;
  readonly owners: readonly GpuMemoryOwnerRow[];
};

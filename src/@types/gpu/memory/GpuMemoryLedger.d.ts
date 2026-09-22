import type { GpuMemorySnapshot } from './GpuMemorySnapshot';

/** The handle `trackGpuMemory(device)` returns — a live tally kept up to date
 *  by wrapping `device.createBuffer`/`createTexture`, read on demand. */
export type GpuMemoryLedger = {
  readonly snapshot: () => GpuMemorySnapshot;
};

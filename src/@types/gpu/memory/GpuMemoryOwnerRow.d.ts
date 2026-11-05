import type { GpuResourceKind } from './GpuResourceKind';

/**
 * GpuMemoryOwnerRow — one (owner, kind) tally in a `GpuMemorySnapshot`.
 * `owner` is the descriptor's `label`, or the basename of the first
 * non-ledger stack frame — see `ownerFromStack`. `gcReclaimed` counts objects
 * GC'd without an explicit `destroy()` — the leak signal. `trackGpuMemory`
 * mutates these fields in place; `snapshot()` hands out a shallow copy per
 * row, so no consumer reference reaches the live ledger.
 */
export type GpuMemoryOwnerRow = {
  readonly owner: string;
  readonly kind: GpuResourceKind;
  bytes: number;
  count: number;
  gcReclaimed: number;
};

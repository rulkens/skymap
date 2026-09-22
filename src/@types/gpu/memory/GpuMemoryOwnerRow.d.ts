import type { GpuResourceKind } from './GpuResourceKind';

/**
 * GpuMemoryOwnerRow — one (owner, kind) tally in a `GpuMemorySnapshot`.
 * `owner` is the descriptor's `label`, or (most call sites have none) the
 * basename of the first non-ledger stack frame — see `ownerFromStack`. An
 * owner allocating both buffers and textures gets two rows, never a merged
 * one. `gcReclaimed` counts objects this row's allocations that were
 * garbage-collected without an explicit `destroy()` — the leak signal the
 * ledger exists to surface.
 */
export type GpuMemoryOwnerRow = {
  readonly owner: string;
  readonly kind: GpuResourceKind;
  readonly bytes: number;
  readonly count: number;
  readonly gcReclaimed: number;
};

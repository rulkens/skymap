/**
 * GpuMemoryOwnerRow — one owner's tally in a `GpuMemorySnapshot`. `owner` is
 * the descriptor's `label`, or (most call sites have none) the basename of
 * the first non-ledger stack frame — see `ownerFromStack`. `gcReclaimed`
 * counts objects this owner allocated that were garbage-collected without an
 * explicit `destroy()` — the leak signal the ledger exists to surface.
 */
export type GpuMemoryOwnerRow = {
  readonly owner: string;
  readonly bytes: number;
  readonly count: number;
  readonly gcReclaimed: number;
};

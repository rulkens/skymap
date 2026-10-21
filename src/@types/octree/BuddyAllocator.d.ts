/** Contiguous record runs in a fixed span: power-of-two sizes, aligned to their size, freed runs re-merged. */
export type BuddyAllocator = {
  /** Start of a free run of `runSize(records)`, lowest address first; null when none is free. */
  alloc(records: number): number | null;
  /** Return a run by the start `alloc` handed out; it merges with its free buddy, repeatedly. */
  free(start: number): void;
  /** The run `records` takes: the next power of two, at least the minimum run. */
  runSize(records: number): number;
};

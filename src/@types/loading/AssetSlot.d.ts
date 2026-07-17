import type { LoadState } from './LoadState';

/**
 * The handle returned by `createAssetSlot`.  This is the public API every
 * consumer of the loading subsystem talks to.
 */
export type AssetSlot<T, Req> = {
  readonly name: string;
  load(req: Req): void;
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
  /**
   * The evict edge of two-way demand. From any state: aborts any in-flight
   * fetch and drops the slot to `idle`, bumping the generation so a commit that
   * resolves after this call fails its race-check and cannot resurrect the slot.
   *
   * Where `cancel()` rolls back to the last ready value (a transient stop),
   * `release()` un-commits: if a payload was committed it runs the slot's
   * `onRelease` hook exactly once so the consumer can free what the commit
   * allocated (destroying a GPU texture is the canonical case). A released slot
   * is idle and will re-load the moment its `demand` predicate turns true again.
   */
  release(): void;
};

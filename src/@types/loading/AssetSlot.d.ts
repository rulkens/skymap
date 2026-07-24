import type { LoadState } from './LoadState';

/**
 * The handle returned by `createAssetSlot`.  This is the public API every
 * consumer of the loading subsystem talks to.
 */
export type AssetSlot<T, Req> = {
  readonly name: string;
  /**
   * Resolves AFTER commit completes (or after any terminal early exit — an
   * abort, a give-up, or a superseded race-check inside `runLoad`). Never
   * rejects: `runLoad` turns every fetch/commit failure into a `gave-up`
   * event rather than a thrown error, so this promise is a "the load's
   * worker task is done" signal, not a success/failure one. A caller that
   * wants to bound in-flight work (the boot-time load queue is the reason
   * this became a promise) can safely `await` it; a fire-and-forget caller
   * marks the call `void` to say so explicitly.
   */
  load(req: Req): Promise<void>;
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
  /**
   * The request the slot last loaded with, or `null` before its first `load()`
   * and after `release()` drops it back to idle.
   *
   * The one read surface onto what a `ready` slot is holding, exposed for the
   * stale-tier evict edge in `reevaluateDemand`: a proximity `release(ctx)`
   * predicate cannot see the slot, so the demand loop compares this committed
   * request's tier against the freshly-clamped `req(state.tier)` tier to decide
   * whether a resident texture is now the wrong resolution. Set on `load`,
   * cleared on `release` — a released slot has nothing committed, so a later
   * `forceReload()` is correctly a no-op.
   */
  lastRequest(): Req | null;
  /**
   * `Date.now()` at the moment the slot's most recent `load()` was CALLED, or
   * `null` before the first one and after `release()`.
   *
   * Pairs with the `ready` state's `loadedAtMs` (commit time) to give the debug
   * panel two independent orderings: which asset the queue STARTED first versus
   * which one FINISHED first. Without a start stamp a 26 MB payload that was
   * dequeued first still reads as "late", which is exactly the confusion a
   * fetch-order investigation needs to rule out.
   *
   * A slot accessor rather than a field on the `loading` LoadState, mirroring
   * `lastRequest()`: `reduceLoadState` is a pure function with no clock, so
   * threading a timestamp through it would mean a new event payload plus
   * carrying the value across the loading → committing → ready rebuilds. The
   * value is a property of the load ATTEMPT, not of any one state, so it lives
   * beside the other attempt-scoped cell.
   */
  startedAtMs(): number | null;
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

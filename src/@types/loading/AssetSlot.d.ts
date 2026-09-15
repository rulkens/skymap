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
  /** The committed value, or `null` when the slot has none. */
  current(): T | null;
  /**
   * The slot's committed state: the current one when `ready`, else the last
   * `ready` state it reached. The ONE reading of "this slot has a committed
   * value" — a slot reloading, committing or erroring over a previous commit
   * still has one, which is what lets a tier swap replace data in place.
   * `release()` is the only thing that clears it.
   */
  committed(): (LoadState<T> & { kind: 'ready'; req: Req }) | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
  /**
   * The request of the slot's last load ATTEMPT — `null` before its first
   * `load()` and after `release()`. While a reload is in flight this is already
   * the NEW request, where `committed().req` is still the previous one.
   *
   * Read by the demand loop's drift edge: when the request a resident slot
   * should hold no longer matches the one it was last loaded with, the slot
   * reloads in place. Release is distance eviction only.
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
   * The evict edge of two-way demand — distance eviction only; a drifted
   * request reloads the slot in place instead. From any state: aborts any
   * in-flight fetch and drops the slot to `idle`, bumping the generation so a
   * commit that resolves after this call cannot resurrect the slot.
   *
   * Where `cancel()` rolls back to the committed value (a transient stop),
   * `release()` drops it, running `onRelease` exactly once so the consumer can
   * free what the commit allocated (a GPU texture is the canonical case). A
   * released slot re-loads the moment its `demand` predicate turns true again.
   */
  release(): void;
};

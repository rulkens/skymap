/**
 * Priority queue + concurrency limiter — a generic helper for "run at
 * most N async tasks at a time, in priority order, deduplicated by key".
 *
 * ### Why this lives in `utils/concurrency/`
 *
 * Originally written as `GalaxyImageQueue` under `services/gpu/` to
 * throttle galaxy thumbnail fetches.  Nothing about the data structure
 * is GPU-specific or galaxy-specific though — it's a vanilla bounded
 * priority queue with key-dedup and an in-flight set.  Moving it to
 * `utils/concurrency/` and renaming makes the reuse case obvious:
 * future fetch-orchestration code (catalog .bin downloads, sidecar
 * loaders, anything else with a "load this when there's a slot" need)
 * can grab the same primitive without depending on the GPU layer.
 *
 * ### Why hand-rolled instead of e.g. p-limit?
 *
 * Two needs are linked: priority (largest-on-screen-first) AND limit.
 * `p-limit` is FIFO.  We also want to dedupe by key, drop stale entries
 * on re-enqueue, and report per-task results — easier to write 60 lines
 * than to wire up three libraries.
 *
 * ### Behaviour
 *
 *   - At most `limit` tasks run at once — a per-instance constructor arg,
 *     defaulting to `MAX_CONCURRENT_FETCHES`.  Different callers want
 *     different bounds: the boot asset queue wants 2, so a handful of big
 *     one-shot fetches (catalog .bin files, body textures) don't flood the
 *     connection pool at startup, while the thumbnail queue wants 4, since
 *     it streams many small fetches as the camera moves and can afford
 *     more parallelism.  Browsers cap HTTP/1.1 at ~6 connections per
 *     origin, so either bound leaves room for other resources without
 *     bottlenecking them.
 *   - When a slot frees, we pick the pending entry with the highest
 *     priority — the engine sets priority to the galaxy's apparent
 *     on-screen pixel size, so big galaxies in the foreground load first.
 *   - `enqueue` starts eagerly, so a caller submitting a whole batch at once
 *     must use `enqueueMany` for priority to govern the FIRST starts too;
 *     see that method's docblock.
 *   - Re-enqueueing the same `key` while the entry is still pending
 *     REPLACES the old entry (priority + fetcher updated).  This lets
 *     the engine bump priority each frame for galaxies that are getting
 *     bigger as the camera moves in.
 *   - Re-enqueueing while in-flight: we let the in-flight finish (its
 *     result still fires the callback), and queue the new entry as
 *     usual.  Cancelling an in-flight fetch is more complexity than
 *     payoff — bandwidth waste is tiny per-frame.
 *
 * ### Generic over the task result type
 *
 * Default `T = ImageBitmap | null` keeps the existing thumbnail call
 * sites short.  Specialising for other workloads is just
 * `new PriorityQueue<MyResult>()`.
 */

import type { QueueEntry } from '../../@types/loading/QueueEntry';
import { MAX_CONCURRENT_FETCHES } from './maxConcurrentFetches';

export class PriorityQueue<T = ImageBitmap | null> {
  private pending = new Map<string, QueueEntry<T>>();
  private inFlight = new Set<string>();
  private drainResolvers: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number = MAX_CONCURRENT_FETCHES) {
    this.limit = limit;
  }

  enqueue(entry: QueueEntry<T>): void {
    if (this.admit(entry)) this.tryStart();
  }

  /**
   * Admit a whole synchronous batch, THEN start.  The distinction from calling
   * `enqueue` in a loop is the whole point: `enqueue` starts a task the moment
   * a slot is free, so in a loop the first `limit` entries walked start
   * immediately, in ARRAY order, before any later (possibly better-ranked)
   * entry has even been seen.  Priority then only decides which entry fills a
   * slot that frees LATER — the head of the queue is chosen by iteration order,
   * not by rank.  That is exactly how a rank-60 all-sky survey took one of the
   * boot's two pipes for 22 seconds ahead of every rank-10 asset the opening
   * view actually draws: it merely sat second in `ASSET_WIRING`.
   *
   * Admitting every entry into `pending` first and calling `tryStart` once
   * restores the invariant callers assume: the first `limit` tasks started are
   * the `limit` best-ranked entries of the batch, whatever order they arrived
   * in.
   *
   * The rejected alternative was to defer `tryStart` inside `enqueue` to a
   * microtask, which would give the same guarantee to every caller for free.
   * It was dropped because it changes semantics for callers that never asked:
   * the galaxy-thumbnail queue enqueues one entry per frame (nothing to batch,
   * so it would only gain latency), and both it and the asset wiring rely on a
   * fetch having actually STARTED by the time the enqueuing call returns.  An
   * explicit batch API keeps the timing change confined to the caller that
   * needs it.
   */
  enqueueMany(entries: readonly QueueEntry<T>[]): void {
    let admitted = false;
    for (const entry of entries) admitted = this.admit(entry) || admitted;
    if (admitted) this.tryStart();
  }

  /**
   * Place an entry in `pending` without starting anything, applying the dedup
   * rules.  Returns whether the entry newly entered `pending`, i.e. whether a
   * `tryStart` could possibly have new work to do.
   */
  private admit(entry: QueueEntry<T>): boolean {
    // Idempotent: if the same key is already in flight, do nothing — the
    // running fetch's `onResult` will fire when it finishes and the
    // caller's per-frame gate (e.g. bitmapReady / bitmapFailed in the
    // engine) decides whether to enqueue again.
    //
    // The earlier implementation `pending.set(entry.key, entry)` here had
    // a subtle bug: while a fetch was in flight, the engine's per-frame
    // loop saw neither bitmapReady nor bitmapFailed (those only get set
    // *after* the fetch resolves) and called enqueue every frame.  Each
    // call wrote to `pending`, so when the in-flight fetch completed, the
    // `.finally` block's `tryStart` call popped the pending entry and
    // executed the fetch a SECOND time.  And while that second fetch ran,
    // the engine kept enqueuing, which queued a third execution, etc.
    // For galaxies where both SDSS and DSS fail, every retry produced a
    // visible 404 in the console — three or more per galaxy.
    //
    // The fix is to refuse to add the key to pending while it's in flight.
    // Priority bumps for already-running fetches are nice-to-have, not
    // necessary; if the caller wants to re-run, it'll get a chance once
    // the current attempt resolves and the per-frame gate clears.
    if (this.inFlight.has(entry.key)) return false;

    // Already pending?  Update priority + fetcher (latest enqueue wins on
    // priority; e.g., as a galaxy gets bigger on screen the engine bumps
    // its priority each frame).  Report "nothing new" — the existing pending
    // entry will be picked up by the next slot release.
    if (this.pending.has(entry.key)) {
      this.pending.set(entry.key, entry);
      return false;
    }

    this.pending.set(entry.key, entry);
    return true;
  }

  /**
   * Resolves once all enqueued and in-flight fetches finish.  Used by tests
   * and by future "wait for thumbnails to settle" UI flows.  Multiple
   * concurrent drain() calls all resolve at the same point — they share
   * the same resolver array.
   */
  drain(): Promise<void> {
    if (this.pending.size === 0 && this.inFlight.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainResolvers.push(resolve));
  }

  /**
   * Number of fetches currently running (not including pending ones).
   * Used by the engine's render-on-demand loop to decide whether to
   * keep ticking — a pending fetch's onResult will dirty the atlas
   * the moment it lands, so we keep one frame queued while at least
   * one is live.
   *
   * Exposing the count rather than a boolean keeps the API honest:
   * a future caller might want to throttle differently when 1 fetch
   * is in flight vs. 4.
   */
  inFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Remove a pending entry by key.  No-op if the key isn't pending — in
   * particular, an in-flight entry is left untouched.  We could try to
   * cancel the in-flight fetch (e.g. AbortController), but responses
   * aren't resumable and the queue's re-enqueue semantics already treat
   * "let it finish" as correct (see the module docblock's "never preempt"
   * note): a caller that no longer wants the result just ignores
   * `onResult`.  Cancelling would add plumbing for a case that's rare in
   * practice — the camera moving away mid-fetch costs one wasted request,
   * not a stuck queue.
   */
  drop(key: string): void {
    this.pending.delete(key);
  }

  /**
   * Tear down the queue: clear every pending entry and resolve any
   * outstanding `drain()` callers.  Exists because every
   * `EngineSubsystemHandles` field satisfies `Destroyable` — without this,
   * a `drain()` call made just before teardown would hang forever, since
   * nothing would ever bring `pending.size` and `inFlight.size` to zero
   * (the in-flight tasks that ARE still running settle on their own timer
   * and their `.finally` handlers already null-check nothing that
   * `destroy()` needs to touch).  In-flight tasks are left to run out
   * rather than aborted, for the same reason `drop()` doesn't touch them.
   */
  destroy(): void {
    this.pending.clear();
    const resolvers = this.drainResolvers.splice(0);
    for (const r of resolvers) r();
  }

  private tryStart(): void {
    while (this.inFlight.size < this.limit && this.pending.size > 0) {
      const entry = this.popHighestPriority();
      if (!entry) break;
      this.inFlight.add(entry.key);
      // Fire-and-forget; the .then handles re-scheduling.  We catch
      // rejected promises so a network error doesn't bubble up as an
      // unhandled rejection — the caller gets the rejection-fallback
      // value (cast `null as T`, which is sound because every existing
      // call site uses a result type that includes null).
      entry
        .fetcher()
        .then(
          (result) => entry.onResult(result),
          () => entry.onResult(null as T),
        )
        .finally(() => {
          this.inFlight.delete(entry.key);
          if (this.pending.size === 0 && this.inFlight.size === 0) {
            const resolvers = this.drainResolvers.splice(0);
            for (const r of resolvers) r();
          } else {
            this.tryStart();
          }
        });
    }
  }

  /**
   * Linear scan over pending entries to find the highest-priority one.
   * O(N) per pop, but N caps at the number of galaxies above the apparent-
   * size threshold simultaneously on screen — typically ≤ 256 (the atlas
   * size).  A heap would be faster asymptotically but adds dependency or
   * 80 LOC for negligible real-world benefit.
   */
  private popHighestPriority(): QueueEntry<T> | undefined {
    let bestKey: string | undefined;
    let bestPriority = -Infinity;
    for (const [key, entry] of this.pending) {
      if (entry.priority > bestPriority) {
        bestPriority = entry.priority;
        bestKey = key;
      }
    }
    if (bestKey === undefined) return undefined;
    const entry = this.pending.get(bestKey)!;
    this.pending.delete(bestKey);
    return entry;
  }
}

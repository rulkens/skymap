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
 *   - At most `MAX_CONCURRENT_FETCHES` tasks run at once.  Browsers cap
 *     HTTP/1.1 at ~6 connections per origin; 4 leaves room for other
 *     resources (the .bin downloads, fonts, etc) without bottlenecking
 *     them when the user zooms in suddenly and we want a flurry of
 *     thumbnails.
 *   - When a slot frees, we pick the pending entry with the highest
 *     priority — the engine sets priority to the galaxy's apparent
 *     on-screen pixel size, so big galaxies in the foreground load first.
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

export const MAX_CONCURRENT_FETCHES = 4;

export type QueueEntry<T = ImageBitmap | null> = {
  key: string;
  priority: number;
  fetcher: () => Promise<T>;
  onResult: (result: T) => void;
};

export class PriorityQueue<T = ImageBitmap | null> {
  private pending = new Map<string, QueueEntry<T>>();
  private inFlight = new Set<string>();
  private drainResolvers: Array<() => void> = [];

  enqueue(entry: QueueEntry<T>): void {
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
    if (this.inFlight.has(entry.key)) return;

    // Already pending?  Update priority + fetcher (latest enqueue wins on
    // priority; e.g., as a galaxy gets bigger on screen the engine bumps
    // its priority each frame).  Don't tryStart — the existing pending
    // entry will be picked up by the next slot release.
    if (this.pending.has(entry.key)) {
      this.pending.set(entry.key, entry);
      return;
    }

    this.pending.set(entry.key, entry);
    this.tryStart();
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

  private tryStart(): void {
    while (this.inFlight.size < MAX_CONCURRENT_FETCHES && this.pending.size > 0) {
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

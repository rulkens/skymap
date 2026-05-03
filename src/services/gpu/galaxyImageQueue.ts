/**
 * Priority queue + concurrency limiter for galaxy image fetches.
 *
 * Why hand-rolled instead of e.g. p-limit? Two needs are linked: priority
 * (largest-on-screen-first) AND limit.  p-limit is FIFO.  We also want to
 * dedupe by key, drop stale entries on re-enqueue, and report per-task
 * results — easier to write 60 lines than to wire up three libraries.
 *
 * Behaviour:
 *   - At most MAX_CONCURRENT_FETCHES fetchers run at once.  Browsers cap
 *     HTTP/1.1 at ~6 connections per origin; 4 leaves room for other
 *     resources (the .bin downloads, fonts, etc) without bottlenecking
 *     them when the user zooms in suddenly and we want a flurry of
 *     thumbnails.
 *   - When a slot frees, we pick the pending entry with the highest
 *     priority — the engine sets priority to the galaxy's apparent on-
 *     screen pixel size, so big galaxies in the foreground load first.
 *   - Re-enqueueing the same `key` while the entry is still pending
 *     REPLACES the old entry (priority + fetcher updated).  This lets
 *     the engine bump priority each frame for galaxies that are getting
 *     bigger as the camera moves in.
 *   - Re-enqueueing while in-flight: we let the in-flight finish (its
 *     result still fires the callback), and queue the new entry as
 *     usual.  Cancelling an in-flight fetch is more complexity than
 *     payoff — bandwidth waste is tiny per-frame.
 */

export const MAX_CONCURRENT_FETCHES = 4;

export type QueueEntry = {
  key: string;
  priority: number;
  fetcher: () => Promise<ImageBitmap | null>;
  onResult: (bitmap: ImageBitmap | null) => void;
};

export class GalaxyImageQueue {
  private pending = new Map<string, QueueEntry>();
  private inFlight = new Set<string>();
  private drainResolvers: Array<() => void> = [];

  enqueue(entry: QueueEntry): void {
    // Idempotent: if the same key is already in flight, do nothing — the
    // running fetch's `onResult` will fire when it finishes and the
    // engine's per-frame gate (bitmapReady / bitmapFailed) decides whether
    // to enqueue again.
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
    // necessary; if the engine wants to re-run, it'll get a chance once
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

  private tryStart(): void {
    while (this.inFlight.size < MAX_CONCURRENT_FETCHES && this.pending.size > 0) {
      const entry = this.popHighestPriority();
      if (!entry) break;
      this.inFlight.add(entry.key);
      // Fire-and-forget; the .then handles re-scheduling.  We catch
      // rejected promises so a network error doesn't bubble up as an
      // unhandled rejection — the caller gets `null` instead.
      entry
        .fetcher()
        .then(
          (bitmap) => entry.onResult(bitmap),
          () => entry.onResult(null),
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
  private popHighestPriority(): QueueEntry | undefined {
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

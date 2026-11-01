/**
 * Priority queue + concurrency limiter: run at most `limit` async tasks at once,
 * highest priority first, deduplicated by key. Hand-rolled because `p-limit` is
 * FIFO and we also need key-dedup and replace-on-re-enqueue.
 *
 * `limit` is per instance (default `MAX_CONCURRENT_FETCHES`): the boot asset queue
 * wants 2 so a few big one-shot fetches do not flood the connection pool, the
 * thumbnail queue 4 since it streams many small ones. Re-enqueueing a PENDING key
 * replaces the entry (priority bumps as a galaxy grows); an IN-FLIGHT key is left
 * to finish and ignored. In-flight fetches are never cancelled.
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
   * Admit a whole synchronous batch, THEN start. `enqueue` starts a task the
   * moment a slot is free, so in a loop the first `limit` entries start in ARRAY
   * order before any better-ranked later entry is seen: a rank-60 all-sky survey
   * once took one of the boot's two pipes for 22 s ahead of every rank-10 asset
   * the opening view draws. Admitting everything first makes the first `limit`
   * starts the `limit` best-ranked of the batch.
   *
   * Deferring `tryStart` inside `enqueue` to a microtask would do this for every
   * caller, but the thumbnail queue (one entry per frame) would only gain latency,
   * and callers rely on a fetch having STARTED when `enqueue` returns.
   */
  enqueueMany(entries: readonly QueueEntry<T>[]): void {
    let admitted = false;
    for (const entry of entries) admitted = this.admit(entry) || admitted;
    if (admitted) this.tryStart();
  }

  /** Place an entry in `pending` without starting anything; true iff it newly entered. */
  private admit(entry: QueueEntry<T>): boolean {
    // Refuse to add an in-flight key: callers re-enqueue every frame until their
    // own ready/failed gate flips (set only AFTER the fetch resolves), and adding
    // it would re-run the fetch when the first one finishes, a visible 404 each
    // time for a galaxy whose SDSS and DSS both fail.
    if (this.inFlight.has(entry.key)) return false;

    if (this.pending.has(entry.key)) {
      this.pending.set(entry.key, entry);
      return false;
    }

    this.pending.set(entry.key, entry);
    return true;
  }

  /** Resolves once all enqueued and in-flight fetches finish. */
  drain(): Promise<void> {
    if (this.pending.size === 0 && this.inFlight.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainResolvers.push(resolve));
  }

  /** Fetches currently running, pending excluded; the render-on-demand loop keeps ticking while any is live. */
  inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Remove a pending entry by key; an in-flight entry is left to finish (the caller ignores `onResult`). */
  drop(key: string): void {
    this.pending.delete(key);
  }

  /**
   * Clear pending entries and resolve outstanding `drain()` callers (which would
   * otherwise hang). In-flight tasks run out rather than being aborted.
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
      // A rejection becomes `onResult(null)`; the cast is sound because every call
      // site's result type includes null.
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

  // Linear scan: N is bounded by the on-screen atlas size (~256), so a heap is not worth its weight.
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

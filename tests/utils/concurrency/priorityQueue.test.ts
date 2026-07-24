import { describe, it, expect, vi } from 'vitest';
import { PriorityQueue } from '../../../src/utils/concurrency/priorityQueue';
import { MAX_CONCURRENT_FETCHES } from '../../../src/utils/concurrency/maxConcurrentFetches';

describe('PriorityQueue', () => {
  it('runs at most MAX_CONCURRENT_FETCHES tasks simultaneously', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const queue = new PriorityQueue();

    for (let i = 0; i < 12; i++) {
      queue.enqueue({
        key: `k${i}`,
        priority: i,
        fetcher: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await sleep(20);
          inFlight--;
          return null;
        },
        onResult: () => {},
      });
    }
    await queue.drain();

    expect(maxInFlight).toBeLessThanOrEqual(MAX_CONCURRENT_FETCHES);
    expect(maxInFlight).toBeGreaterThan(1); // sanity: parallelism actually happened
  });

  it('processes higher-priority entries first', async () => {
    const queue = new PriorityQueue();
    const order: string[] = [];
    // Saturate ALL slots with blockers so subsequent enqueues sit pending
    // until we release them one-by-one.  This avoids the timing trap where
    // fast-resolving fillers drain pending items before we get a chance to
    // observe priority ordering.
    const unblockers: Array<() => void> = [];
    for (let i = 0; i < MAX_CONCURRENT_FETCHES; i++) {
      const gate = new Promise<void>((r) => unblockers.push(r));
      queue.enqueue({
        key: `blocker-${i}`,
        priority: 0,
        fetcher: async () => {
          await gate;
          return null;
        },
        onResult: () => order.push(`blocker-${i}`),
      });
    }
    // With all slots busy, these three enqueues stay pending — popHighest
    // Priority will choose among them when a slot frees.
    queue.enqueue({
      key: 'low',
      priority: 1,
      fetcher: async () => null,
      onResult: () => order.push('low'),
    });
    queue.enqueue({
      key: 'high',
      priority: 10,
      fetcher: async () => null,
      onResult: () => order.push('high'),
    });
    queue.enqueue({
      key: 'mid',
      priority: 5,
      fetcher: async () => null,
      onResult: () => order.push('mid'),
    });

    // Release the blockers; each freed slot pulls the highest-priority
    // pending entry next (high, then mid, then low).
    for (const u of unblockers) u();
    await queue.drain();

    // Filter out blockers — their relative order isn't what we're testing.
    const priorityOrder = order.filter((k) => !k.startsWith('blocker-'));
    expect(priorityOrder).toEqual(['high', 'mid', 'low']);
  });

  it('pops the highest priority pending entry when a slot frees', async () => {
    const queue = new PriorityQueue(2);
    const started: string[] = [];
    const unblockers: Array<() => void> = [];

    // Two gated blockers saturate the two slots the constructed limit
    // allows.
    for (let i = 0; i < 2; i++) {
      const gate = new Promise<void>((r) => unblockers.push(r));
      queue.enqueue({
        key: `blocker-${i}`,
        priority: 0,
        fetcher: async () => {
          started.push(`blocker-${i}`);
          await gate;
          return null;
        },
        onResult: () => {},
      });
    }

    // Enqueued out of rank order: the queue must sort by priority when it
    // pulls from `pending`, not preserve enqueue order.
    queue.enqueue({
      key: 'low',
      priority: 1,
      fetcher: async () => {
        started.push('low');
        return null;
      },
      onResult: () => {},
    });
    queue.enqueue({
      key: 'high',
      priority: 10,
      fetcher: async () => {
        started.push('high');
        return null;
      },
      onResult: () => {},
    });
    queue.enqueue({
      key: 'mid',
      priority: 5,
      fetcher: async () => {
        started.push('mid');
        return null;
      },
      onResult: () => {},
    });

    // Free exactly one of the two saturating slots first, and let the
    // microtask queue settle before freeing the other.  With only one slot
    // open, the three immediately-resolving pending entries cycle through
    // it one at a time, so which one starts next is decided purely by
    // priority — not by two entries racing into two simultaneously-freed
    // slots, which would make start order a scheduling accident instead of
    // a priority decision.
    unblockers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    unblockers[1]!();
    await queue.drain();

    expect(started.filter((k) => !k.startsWith('blocker'))).toEqual(['high', 'mid', 'low']);
  });

  it('calls onResult with the fetcher result', async () => {
    const queue = new PriorityQueue();
    const cb = vi.fn();
    const fakeBitmap = { close: () => {} } as unknown as ImageBitmap;
    queue.enqueue({
      key: 'k',
      priority: 1,
      fetcher: async () => fakeBitmap,
      onResult: cb,
    });
    await queue.drain();
    expect(cb).toHaveBeenCalledWith(fakeBitmap);
  });

  it('inFlightCount reports the number of running fetches', async () => {
    const queue = new PriorityQueue();
    expect(queue.inFlightCount()).toBe(0);

    // Build a fetcher that we can resolve manually.
    let resolveFetch: (b: ImageBitmap | null) => void = () => {};
    const fetcher = () =>
      new Promise<ImageBitmap | null>((resolve) => {
        resolveFetch = resolve;
      });

    queue.enqueue({ key: 'k1', priority: 1, fetcher, onResult: () => {} });
    expect(queue.inFlightCount()).toBe(1);

    resolveFetch(null);
    // Drain so the .finally() runs and the count drops back to 0.
    await queue.drain();
    expect(queue.inFlightCount()).toBe(0);
  });
});

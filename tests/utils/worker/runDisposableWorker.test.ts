/**
 * Tests for runDisposableWorker — the generic worker-lifecycle helper
 * shared by every off-thread bake.
 *
 * ### What we assert here
 *
 * 1. On success: postMessage receives (input, transfer); the Promise
 *    resolves with the worker's MessageEvent.data; the worker is
 *    terminated exactly once.
 * 2. On failure with an `event.error` set: the Promise rejects with
 *    that error; worker terminated once.
 * 3. On failure with only `event.message`: the Promise rejects with
 *    a new Error using the message and the supplied label as a
 *    fallback prefix.
 * 4. On failure with neither error nor message: the Promise rejects
 *    with `new Error('<label> worker error')` — the all-fallback path.
 *
 * ### Fake Worker — why and how
 *
 * Vitest does not natively run Vite's `?worker` chunks, so production
 * code injects a Worker constructor as the first argument to
 * runDisposableWorker. The test substitutes a FakeWorker class whose
 * `onmessage` / `onerror` we can drive synchronously after the helper
 * has wired them up. The class only implements the surface the helper
 * touches (postMessage, terminate, onmessage, onerror) — not the full
 * DOM Worker interface.
 */

import { describe, it, expect, vi } from 'vitest';
import { runDisposableWorker } from '../../../src/utils/worker/runDisposableWorker';

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

/**
 * The latest FakeWorker constructed, captured so the test can drive
 * its onmessage/onerror callbacks after runDisposableWorker has
 * attached them.
 */
let lastWorker: FakeWorker | null = null;
class FakeWorkerCtor {
  constructor() {
    lastWorker = new FakeWorker();
    return lastWorker as unknown as FakeWorkerCtor;
  }
}

describe('runDisposableWorker', () => {
  it('resolves with event.data and terminates the worker on success', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<{ n: number }, number>(
      FakeWorkerCtor as unknown as new () => Worker,
      { n: 42 },
      [],
      'test',
    );

    expect(lastWorker).not.toBeNull();
    expect(lastWorker!.postMessage).toHaveBeenCalledTimes(1);
    expect(lastWorker!.postMessage).toHaveBeenCalledWith({ n: 42 }, []);

    lastWorker!.onmessage!({ data: 99 } as MessageEvent);

    await expect(promise).resolves.toBe(99);
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with event.error when present and terminates the worker', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'test',
    );

    const err = new Error('boom');
    lastWorker!.onerror!({ error: err, message: 'unused' } as ErrorEvent);

    await expect(promise).rejects.toBe(err);
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with a labelled Error built from event.message when event.error is missing', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'test-bake',
    );

    lastWorker!.onerror!({ error: null, message: 'something failed' } as unknown as ErrorEvent);

    await expect(promise).rejects.toThrow('something failed');
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with the label-only fallback when neither error nor message is set', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'angular-weights',
    );

    lastWorker!.onerror!({ error: null, message: '' } as unknown as ErrorEvent);

    await expect(promise).rejects.toThrow('angular-weights worker error');
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('passes the transfer list through to postMessage verbatim', async () => {
    lastWorker = null;
    const transfer = [new ArrayBuffer(8), new ArrayBuffer(8)] as Transferable[];
    const promise = runDisposableWorker<{ x: number }, number>(
      FakeWorkerCtor as unknown as new () => Worker,
      { x: 1 },
      transfer,
      'test',
    );

    expect(lastWorker!.postMessage).toHaveBeenCalledWith({ x: 1 }, transfer);

    lastWorker!.onmessage!({ data: 0 } as MessageEvent);
    await promise;
  });
});

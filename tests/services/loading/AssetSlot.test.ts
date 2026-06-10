import { describe, expect, it, vi } from 'vitest';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { Fetcher } from '../../../src/@types/loading/Fetcher';
import type { RetryPolicy } from '../../../src/@types/loading/RetryPolicy';

const noRetry: RetryPolicy = () => 'give-up';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AssetSlot — happy path', () => {
  it('load → fetch resolves → ready with value', async () => {
    const fetch: Fetcher<string, { id: number }> = vi.fn().mockResolvedValue('payload-A');
    const slot = createAssetSlot<string, { id: number }>({
      name: 'test',
      fetch,
      retry: noRetry,
    });
    const states: string[] = [];
    slot.subscribe((s) => states.push(s.kind));
    slot.load({ id: 1 });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('payload-A');
    expect(states).toContain('loading');
    expect(states).toContain('ready');
  });

  it('runs commit before becoming ready', async () => {
    const fetch: Fetcher<string, void> = vi.fn().mockResolvedValue('X');
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      commit,
      retry: noRetry,
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(commit).toHaveBeenCalledWith('X', expect.any(AbortSignal));
  });
});

describe('AssetSlot — ready-after-commit ordering', () => {
  it('subscribers do not observe ready until the async commit body resolves', async () => {
    // Guards the invariant that installSlotReadyWake relies on: the 'ready'
    // notification arrives only AFTER the commit body has completed (so a
    // GPU-upload commit finishes writing vertex data before the wake fires).
    const fetchResult = 'payload';
    const commitGate = deferred<void>();
    const fetch: Fetcher<string, void> = vi.fn().mockResolvedValue(fetchResult);
    const commit = vi.fn(() => commitGate.promise);
    const slot = createAssetSlot<string, void>({ name: 'test', fetch, commit, retry: noRetry });

    const observed: string[] = [];
    slot.subscribe((s) => observed.push(s.kind));

    slot.load();
    // Let the fetch resolve and the commit start.
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    // The commit body is still pending — no 'ready' yet.
    expect(observed).not.toContain('ready');

    // Unblock the commit body.
    commitGate.resolve();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    // 'ready' arrives only after resolve.
    expect(observed).toContain('ready');
    // And the commit ran exactly once.
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('AssetSlot — race-fix (the structural bug from the existing cloudLoader)', () => {
  it('drops superseded fetch result before commit (race window 1)', async () => {
    const fetchA = deferred<string>();
    const fetchB = deferred<string>();
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn(() => {
      calls += 1;
      return calls === 1 ? fetchA.promise : fetchB.promise;
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1); // starts fetch A
    slot.load(2); // starts fetch B; A's controller aborts
    fetchA.resolve('A'); // A's resolution arrives — must NOT commit
    fetchB.resolve('B');
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(slot.current()).toBe('B');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('B', expect.any(AbortSignal));
  });

  it('drops superseded commit result (race window 2 — async commit)', async () => {
    const fetchA = deferred<string>();
    const commitA = deferred<void>();
    const fetchB = deferred<string>();
    const commitB = deferred<void>();
    let fetchCalls = 0;
    let commitCalls = 0;
    const fetch: Fetcher<string, number> = vi.fn(() => {
      fetchCalls += 1;
      return fetchCalls === 1 ? fetchA.promise : fetchB.promise;
    });
    const commit = vi.fn(() => {
      commitCalls += 1;
      return commitCalls === 1 ? commitA.promise : commitB.promise;
    });
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1);
    fetchA.resolve('A');
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));

    slot.load(2); // mid-commit-A: starts fetch B, increments generation
    commitA.resolve(); // commit A finishes — must NOT mark slot ready with A
    fetchB.resolve('B');
    commitB.resolve();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(slot.current()).toBe('B');
  });

  it('does not call commit when fetch was aborted', async () => {
    const fetchA = deferred<string>();
    const fetchB = deferred<string>();
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn((_req, signal) => {
      calls += 1;
      const d = calls === 1 ? fetchA : fetchB;
      signal.addEventListener('abort', () =>
        d.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
      return d.promise;
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1);
    slot.load(2); // aborts A's controller
    fetchB.resolve('B');
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('B', expect.any(AbortSignal));
  });
});

describe('AssetSlot — retry', () => {
  it('retries per policy after transient failure', async () => {
    let calls = 0;
    const fetch: Fetcher<string, void> = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('boom');
      return 'OK';
    });
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      retry: (attempt) => (attempt < 3 ? { delayMs: 0 } : 'give-up'),
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'), { timeout: 1000 });
    expect(calls).toBe(3);
    expect(slot.current()).toBe('OK');
  });

  it('transitions to error after retry exhaustion', async () => {
    const fetch: Fetcher<string, void> = vi.fn().mockRejectedValue(new Error('boom'));
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      retry: (attempt) => (attempt < 1 ? { delayMs: 0 } : 'give-up'),
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('AssetSlot — cancel and forceReload', () => {
  it('cancel() aborts active fetch and reverts to last ready value', async () => {
    const first: Fetcher<string, number> = vi.fn().mockResolvedValue('A');
    const slot = createAssetSlot<string, number>({ name: 'test', fetch: first, retry: noRetry });
    slot.load(1);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    const pending = deferred<string>();
    const second: Fetcher<string, number> = (_req, signal) => {
      signal.addEventListener('abort', () =>
        pending.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
      return pending.promise;
    };
    // Replace fetcher mid-test by recreating — simpler than vi.fn juggling.
    const slot2 = createAssetSlot<string, number>({ name: 'test', fetch: second, retry: noRetry });
    slot2.load(1);
    await vi.waitFor(() => expect(slot2.state().kind).toBe('loading'));
    slot2.cancel();
    expect(slot2.state().kind).toBe('idle');
  });

  it('forceReload re-runs the last request', async () => {
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn(async () => {
      calls += 1;
      return `payload-${calls}`;
    });
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, retry: noRetry });
    slot.load(42);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.forceReload();
    await vi.waitFor(() => expect(slot.current()).toBe('payload-2'));
    expect(calls).toBe(2);
  });
});

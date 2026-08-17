/**
 * Tests for `awaitSlotReady` — the AssetSlot → Promise adapter.
 *
 * The helper has only four interesting code paths (null slot,
 * cached-ready fast path, transition-to-ready, transition-to-error)
 * plus one structural invariant (unsubscribe-then-resolve so a later
 * transition can't re-enter the closure).  The cases below cover all
 * five.  We use a hand-rolled fake `AssetSlot` rather than the real
 * `createAssetSlot` factory so each test can drive the state machine
 * deterministically without fighting the retry-policy/race-fix
 * machinery — those are exhaustively tested in `AssetSlot.test.ts`
 * already, and what we want to verify here is purely the adapter's
 * behaviour against the public `AssetSlot` shape.
 */

import { describe, expect, it, vi } from 'vitest';
import { awaitSlotReady } from '../../../src/services/loading/awaitSlotReady';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../src/@types/loading/LoadState';

/**
 * Build a minimal fake slot that exposes `state()`, `subscribe()`, and
 * a `transition(state)` method we can call from the test to push the
 * slot into the next state and notify any active subscriber.  The
 * other `AssetSlot` methods (`load`, `current`, `forceReload`,
 * `cancel`, `name`) are stubbed because `awaitSlotReady` never reads
 * them — keeping them as `vi.fn()`s lets us also assert "not called"
 * if a future regression starts touching them.
 */
function makeFakeSlot<T>(initial: LoadState<T>): {
  slot: AssetSlot<T, unknown>;
  transition: (next: LoadState<T>) => void;
  subscriberSpy: ReturnType<typeof vi.fn>;
} {
  let current: LoadState<T> = initial;
  const listeners = new Set<(s: LoadState<T>) => void>();
  const subscriberSpy = vi.fn((s: LoadState<T>) => {
    // Spy is the wrapper subscribed by the helper; we record every
    // delivery here so individual tests can assert call counts.
    void s;
  });
  const slot: AssetSlot<T, unknown> = {
    name: 'fake',
    load: vi.fn(),
    current: () => (current.kind === 'ready' ? current.value : null),
    state: () => current,
    subscribe: (fn) => {
      // Wrap the helper's subscriber so we can spy on every delivery
      // from the slot side without touching the helper internals.
      const wrapped = (s: LoadState<T>) => {
        subscriberSpy(s);
        fn(s);
      };
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
  };
  return {
    slot,
    transition: (next) => {
      current = next;
      // Snapshot listeners before calling — a `ready` listener will
      // unsubscribe itself synchronously, and mutating the Set during
      // iteration would either skip or double-fire siblings.
      for (const fn of [...listeners]) fn(next);
    },
    subscriberSpy,
  };
}

describe('awaitSlotReady', () => {
  it('resolves with the fallback when the slot is null', async () => {
    const fallback = new Map<string, number>([['fallback', 1]]);
    const result = await awaitSlotReady<Map<string, number>>(null, fallback);
    expect(result).toBe(fallback);
  });

  it('resolves with the cached value when the slot is already ready (no subscription)', async () => {
    const value = new Map<string, number>([['cached', 42]]);
    const { slot, subscriberSpy } = makeFakeSlot<Map<string, number>>({
      kind: 'ready',
      req: undefined,
      value,
      loadedAtMs: 0,
    });
    const result = await awaitSlotReady(slot, new Map());
    expect(result).toBe(value);
    // Fast-path: must NOT subscribe when state is already ready.
    expect(subscriberSpy).not.toHaveBeenCalled();
  });

  it('resolves with the value after a loading → ready transition', async () => {
    const { slot, transition } = makeFakeSlot<string>({
      kind: 'loading',
      req: undefined,
      loaded: 0,
      total: 0,
      attempt: 0,
    });
    const promise = awaitSlotReady<string>(slot, 'fallback');
    transition({ kind: 'ready', req: undefined, value: 'payload', loadedAtMs: 1 });
    await expect(promise).resolves.toBe('payload');
  });

  it('resolves with the fallback after a loading → error transition', async () => {
    const { slot, transition } = makeFakeSlot<string>({
      kind: 'loading',
      req: undefined,
      loaded: 0,
      total: 0,
      attempt: 0,
    });
    const promise = awaitSlotReady<string>(slot, 'fallback-value');
    transition({ kind: 'error', req: undefined, error: new Error('boom'), finalAttempt: 1 });
    await expect(promise).resolves.toBe('fallback-value');
  });

  it('unsubscribes on resolve so later transitions cannot re-enter the closure', async () => {
    const { slot, transition, subscriberSpy } = makeFakeSlot<string>({
      kind: 'loading',
      req: undefined,
      loaded: 0,
      total: 0,
      attempt: 0,
    });
    const promise = awaitSlotReady<string>(slot, 'fallback-value');
    transition({ kind: 'ready', req: undefined, value: 'A', loadedAtMs: 1 });
    await expect(promise).resolves.toBe('A');
    const callsAfterResolve = subscriberSpy.mock.calls.length;
    // Drive a further transition the helper must not hear.
    // If `unsub()` ran before `resolve(...)` (the documented contract),
    // the subscriberSpy stays at the same call count; if a regression
    // resolves first and unsubscribes second, this transition would
    // fire the (now-stale) listener and bump the count.
    transition({ kind: 'error', req: undefined, error: new Error('late'), finalAttempt: 2 });
    expect(subscriberSpy.mock.calls.length).toBe(callsAfterResolve);
  });

  it('ignores transient loading transitions and waits for ready', async () => {
    // Defends the implicit "only ready/error settle the promise"
    // contract.  A future refactor that accidentally settled on
    // `committing` or any non-terminal state would resolve too early.
    const { slot, transition } = makeFakeSlot<string>({
      kind: 'idle',
    });
    const promise = awaitSlotReady<string>(slot, 'fallback');
    transition({ kind: 'loading', req: undefined, loaded: 0, total: 100, attempt: 0 });
    transition({ kind: 'loading', req: undefined, loaded: 50, total: 100, attempt: 0 });
    transition({ kind: 'committing', req: undefined });
    transition({ kind: 'ready', req: undefined, value: 'final', loadedAtMs: 1 });
    await expect(promise).resolves.toBe('final');
  });
});

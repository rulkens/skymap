/**
 * createStore — verifies the snapshot/subscribe/setState contract.
 *
 * The store is the cosmic-flow tool's single source of truth: a closure over a
 * mutable snapshot plus a listener set. The behaviours that matter are the
 * reference-equality gate (no notification when the update returns the same
 * object, so a no-op setState never wakes React) and immutability of the
 * previous snapshot (updaters must return fresh objects, never mutate `prev`).
 * These tests pin both, plus subscribe/unsubscribe bookkeeping.
 */
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../../../tools/cosmic-flow/src/state/createStore';

type Counter = { readonly n: number };

describe('createStore', () => {
  it('getSnapshot returns the initial state', () => {
    const initial: Counter = { n: 0 };
    const store = createStore(initial);
    expect(store.getSnapshot()).toEqual(initial);
  });

  it('setState replaces the snapshot with the update result', () => {
    const initial: Counter = { n: 0 };
    const store = createStore(initial);
    store.setState((prev) => ({ n: prev.n + 1 }));
    expect(store.getSnapshot()).toEqual({ n: 1 });
    // The original snapshot object is untouched — updaters return fresh state.
    expect(initial.n).toBe(0);
  });

  it('subscribe is called when state changes', () => {
    const store = createStore<Counter>({ n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((prev) => ({ n: prev.n + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe is NOT called when the update returns the same reference', () => {
    const store = createStore<Counter>({ n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((prev) => prev);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore<Counter>({ n: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState((prev) => ({ n: prev.n + 1 }));
    expect(listener).not.toHaveBeenCalled();
  });
});

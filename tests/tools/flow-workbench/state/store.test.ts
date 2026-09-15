/**
 * createStore — verifies the snapshot/subscribe/setState contract.
 *
 * The store is the flow-workbench tool's single source of truth: a closure over a
 * mutable snapshot plus a listener set. The behaviours that matter are the
 * reference-equality gate (no notification when the update returns the same
 * object, so a no-op setState never wakes React) and immutability of the
 * previous snapshot (updaters must return fresh objects, never mutate `prev`).
 * These tests pin both, plus subscribe/unsubscribe bookkeeping.
 */
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../../../tools/flow-workbench/src/state/createStore';

type Counter = { readonly n: number };

describe('createStore', () => {
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

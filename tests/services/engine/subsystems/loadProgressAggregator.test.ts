/**
 * Tests for `createLoadProgressEmitter` — the thin subscriber facade
 * that projects a slot map through `aggregateRegistry` and forwards
 * the snapshot to `cb.onLoadProgress`.
 *
 * The contract under test:
 *   - `null` snapshot when nothing's in flight (so the bar can fade out).
 *   - Non-null snapshot whose loaded/total are sums across in-flight slots.
 *   - `attachSlot` wires the emitter to the slot's subscriber so every
 *     state transition triggers a recompute.
 *   - `committing` slots count as in-flight (UI keeps the bar visible
 *     during the GPU-upload tail).
 *
 * Pre-rework, this module owned its own `Map<source, Entry>` and the
 * tests exercised idempotent `start/update/finish` mutators.  Post-Task-12
 * the source of truth is the slot map itself, so the tests use fake
 * slots with mutable state cells matching the AssetSlot interface.
 */

import { describe, expect, it, vi } from 'vitest';
import { createLoadProgressEmitter } from '../../../../src/services/engine/subsystems/loadProgressAggregator';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { LoadProgressState } from '../../../../src/@types/loading/LoadProgressState';

/**
 * Build a minimal fake AssetSlot whose `state()` reads a mutable cell
 * and whose `subscribe` is a no-arg pub/sub.  Just enough to drive the
 * emitter without spinning up real fetch/commit machinery.
 *
 * Why not use the real `createAssetSlot`?  The emitter only consumes
 * `slot.name`, `slot.state()`, and `slot.subscribe()`; the real slot's
 * fetch+commit lifecycle is irrelevant here and would force every test
 * to invent a network mock.  The fake keeps the test surface focused
 * on the projection logic the emitter is responsible for.
 */
function fakeSlot(name: string): {
  slot: AssetSlot<unknown, unknown>;
  set: (s: LoadState<unknown>) => void;
  subscriberCount: () => number;
} {
  let cur: LoadState<unknown> = { kind: 'idle' };
  const subs = new Set<(s: LoadState<unknown>) => void>();
  const slot: AssetSlot<unknown, unknown> = {
    name,
    load: () => Promise.resolve(),
    current: () => null,
    state: () => cur,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
  function set(next: LoadState<unknown>): void {
    cur = next;
    for (const fn of subs) fn(next);
  }
  return { slot, set, subscriberCount: () => subs.size };
}

describe('createLoadProgressEmitter', () => {
  it('emits null when no slot is in flight', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const slots = new Map<string, AssetSlot<unknown, unknown>>();
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.emit();
    expect(emit).toHaveBeenLastCalledWith(null);
  });

  it('emits a snapshot when a slot transitions to loading', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.attachSlot(a.slot);

    a.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    expect(emit).toHaveBeenLastCalledWith({
      loadedBytes: 0,
      totalBytes: 1000,
      inFlightCount: 1,
    });
  });

  it('sums loaded + total across multiple loading slots', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const b = fakeSlot('b');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([
      [a.slot.name, a.slot],
      [b.slot.name, b.slot],
    ]);
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.attachSlot(a.slot);
    emitter.attachSlot(b.slot);

    a.set({ kind: 'loading', req: undefined, loaded: 500, total: 1000, attempt: 0 });
    b.set({ kind: 'loading', req: undefined, loaded: 2500, total: 5000, attempt: 0 });

    expect(emit).toHaveBeenLastCalledWith({
      loadedBytes: 3000,
      totalBytes: 6000,
      inFlightCount: 2,
    });
  });

  it('falls back to null when every slot reaches ready', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.attachSlot(a.slot);

    a.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    a.set({ kind: 'ready', req: undefined, value: 42, loadedAtMs: 0 });

    expect(emit).toHaveBeenLastCalledWith(null);
  });

  it('counts committing slots as in-flight (bar stays visible during GPU upload)', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.attachSlot(a.slot);

    a.set({ kind: 'committing', req: undefined });
    const last = emit.mock.calls.at(-1)![0];
    expect(last).not.toBeNull();
    expect(last!.inFlightCount).toBe(1);
  });

  it('still emits null after an error transition (errors are not in-flight)', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);
    emitter.attachSlot(a.slot);

    a.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    a.set({ kind: 'error', req: undefined, error: new Error('x'), finalAttempt: 0 });
    expect(emit).toHaveBeenLastCalledWith(null);
  });

  /**
   * Audit finding #15: pre-this-PR, `attachSlot(slot)` called
   * `slot.subscribe(publish)` and discarded the unsubscriber.
   * Subscriptions outlived `engine.destroy()`, so any slot state change
   * after teardown still fired `publish` (which then called the emit
   * callback, possibly closing over a stale reference).  The three
   * tests below pin the fix: attach wires a subscriber, destroy()
   * releases every captured handle, and destroy() is idempotent.
   */
  it('attachSlot wires a subscriber that fires emit on slot transition', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);

    emitter.attachSlot(a.slot);
    expect(a.subscriberCount()).toBe(1);

    a.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    expect(emit).toHaveBeenCalled();
  });

  it('destroy() releases every attached subscriber', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const b = fakeSlot('b');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([
      [a.slot.name, a.slot],
      [b.slot.name, b.slot],
    ]);
    const emitter = createLoadProgressEmitter(emit, slots);

    emitter.attachSlot(a.slot);
    emitter.attachSlot(b.slot);
    expect(a.subscriberCount()).toBe(1);
    expect(b.subscriberCount()).toBe(1);

    emitter.destroy();

    // Both slots now have zero subscribers — the unsubscribers were
    // called from inside destroy().
    expect(a.subscriberCount()).toBe(0);
    expect(b.subscriberCount()).toBe(0);

    // Post-destroy transitions must not fire emit.
    emit.mockClear();
    a.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    b.set({ kind: 'loading', req: undefined, loaded: 0, total: 1000, attempt: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('destroy() is idempotent', () => {
    const emit = vi.fn<(state: LoadProgressState | null) => void>();
    const a = fakeSlot('a');
    const slots = new Map<string, AssetSlot<unknown, unknown>>([[a.slot.name, a.slot]]);
    const emitter = createLoadProgressEmitter(emit, slots);

    emitter.attachSlot(a.slot);
    emitter.destroy();

    expect(() => emitter.destroy()).not.toThrow();
    expect(a.subscriberCount()).toBe(0);
  });
});

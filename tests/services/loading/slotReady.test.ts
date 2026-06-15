/**
 * slotReady — the single reading of "this layer is loaded = its slot committed
 * to the renderer (LoadState 'ready')". Replaces the per-layer status mirrors
 * (the deleted flow/filament stores) that duplicated the slot's own `ready`.
 */
import { describe, it, expect } from 'vitest';
import { slotReady } from '../../../src/services/loading/slotReady';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../src/@types/loading/LoadState';

/** Minimal slot stub exposing only the `state()` the predicate reads. */
function fakeSlot<T>(state: LoadState<T>): AssetSlot<T, unknown> {
  return { name: 'fake', state: () => state } as unknown as AssetSlot<T, unknown>;
}

describe('slotReady', () => {
  it('is false for a null slot (the pre-wireSlots window)', () => {
    expect(slotReady(null)).toBe(false);
  });

  it('is false before any load (idle)', () => {
    expect(slotReady(fakeSlot({ kind: 'idle' }))).toBe(false);
  });

  it('is false while loading', () => {
    expect(slotReady(fakeSlot({ kind: 'loading', req: {}, loaded: 1, total: 2, attempt: 1 }))).toBe(
      false,
    );
  });

  it('is false while committing (uploaded not yet confirmed ready)', () => {
    expect(slotReady(fakeSlot({ kind: 'committing', req: {} }))).toBe(false);
  });

  it('is false on a terminal error', () => {
    expect(
      slotReady(fakeSlot({ kind: 'error', req: {}, error: new Error('x'), finalAttempt: 3 })),
    ).toBe(false);
  });

  it('is true once the slot has committed (ready)', () => {
    expect(slotReady(fakeSlot({ kind: 'ready', req: {}, value: 42, loadedAtMs: 0 }))).toBe(true);
  });
});

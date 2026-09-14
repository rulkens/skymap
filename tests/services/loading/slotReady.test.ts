/**
 * slotReady — the single reading of "this layer is loaded = its slot has a
 * committed value". Replaces the per-layer status mirrors (the deleted
 * flow/filament stores) that duplicated the slot's own committed state.
 */
import { describe, it, expect } from 'vitest';
import { slotReady } from '../../../src/services/loading/slotReady';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../src/@types/loading/LoadState';

/** Slot stub carrying an independent live `state()` and `committed()` value,
 *  so a test can drive the two apart the way a reloading slot does. */
function fakeSlot<T>(
  state: LoadState<T>,
  committed: (LoadState<T> & { kind: 'ready'; req: unknown }) | null,
): AssetSlot<T, unknown> {
  return {
    name: 'fake',
    state: () => state,
    committed: () => committed,
  } as unknown as AssetSlot<T, unknown>;
}

describe('slotReady', () => {
  it('is false for a null slot (the pre-wireSlots window)', () => {
    expect(slotReady(null)).toBe(false);
  });

  it('is false for a slot loading for the first time', () => {
    expect(
      slotReady(fakeSlot({ kind: 'loading', req: {}, loaded: 0, total: 0, attempt: 1 }, null)),
    ).toBe(false);
  });

  it('is true once the slot has committed (ready)', () => {
    expect(
      slotReady(
        fakeSlot(
          { kind: 'ready', req: {}, value: 42, loadedAtMs: 0 },
          { kind: 'ready', req: {}, value: 42, loadedAtMs: 0 },
        ),
      ),
    ).toBe(true);
  });

  it('is true for a slot reloading with a previous commit', () => {
    // A reload drops `state()` to `loading` but `committed()` keeps the previous
    // ready state until the new one lands — slotReady must track that, not the
    // live load state, or a reload would flash the layer "unready".
    expect(
      slotReady(
        fakeSlot(
          { kind: 'loading', req: {}, loaded: 0, total: 0, attempt: 1 },
          { kind: 'ready', req: {}, value: 42, loadedAtMs: 0 },
        ),
      ),
    ).toBe(true);
  });
});

/**
 * structureCatalogSlot — verifies the slot transitions correctly and degrades
 * gracefully on fetch failure.
 *
 * The slot has no GPU commit and owns no state — `wireStructureProjection`
 * subscribes to the same slot and consumes the ready value. The render wake
 * is handled generically by `installSlotReadyWake` in the wiring layer, so
 * the only observable slot-level behaviour is a `console.warn` on error.
 * We mock the fetcher module so `slot.load()` drives a deterministic
 * ready/error transition without touching the network.
 */
import { describe, expect, it, vi } from 'vitest';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/StructureCatalogPayload';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/structureCatalogFetcher', () => ({
  structureCatalogFetcher: mockFetch,
}));

import { createStructureCatalogSlot } from '../../../../src/services/loading/slots/structureCatalogSlot';

function fakePayload(): StructureCatalogPayload {
  return {
    catalog: {
      count: 1,
      positions: new Float32Array([1, 2, 3]),
      physicalRadiusMpc: new Float32Array([0.5]),
      apparentRadiusMpc: new Float32Array([1.2]),
      significance: new Float32Array([1e14]),
      category: new Uint8Array([0]),
    },
    meta: [{ id: 'a426', names: ['Perseus'], abell: 'A426', description: 'A nearby cluster.' }],
  };
}

// Minimal fake state — the slot subscriber only warns on error; no state
// fields are touched on the ready path.
function fakeState(): EngineState {
  return {
    assetSlots: {},
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createStructureCatalogSlot', () => {
  it('transitions to ready and returns a correctly-named slot', async () => {
    const payload = fakePayload();
    mockFetch.mockResolvedValue(payload);
    const state = fakeState();

    const slot = createStructureCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // Construction purity: the factory RETURNS the slot and does NOT
    // self-install it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('structure-catalog');
    expect(state.assetSlots.structureCatalog).toBeUndefined();
  });

  it('warns on error', async () => {
    // A 404 is a permanent failure under defaultRetryPolicy → give-up
    // immediately (no slow backoff), so the slot reaches 'error' at once.
    mockFetch.mockRejectedValue(new HttpError(404, 'structures.ccat'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = fakeState();

    const slot = createStructureCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

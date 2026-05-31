/**
 * clusterCatalogSlot — verifies the slot subscriber writes CPU-side POI data
 * into engine state and degrades gracefully on fetch failure.
 *
 * The slot has no GPU commit, so the only observable behaviour is its effect
 * on `state.sources.clusterBulk` + a `requestRender()` wake. We mock the
 * fetcher module so `slot.load()` drives a deterministic ready/error
 * transition without touching the network.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ClusterCatalogPayload } from '../../../../src/@types/loading/ClusterCatalogPayload';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/clusterCatalogFetcher', () => ({
  clusterCatalogFetcher: mockFetch,
}));

import { createClusterCatalogSlot } from '../../../../src/services/loading/slots/clusterCatalogSlot';

function fakePayload(): ClusterCatalogPayload {
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

// Minimal fake state — the slot only touches `sources.clusterBulk` and
// `subsystems.scheduler.requestRender`. `as never` lets us hand the factory
// a stub without modelling the whole EngineState tree.
function fakeState(): { state: EngineState; requestRender: ReturnType<typeof vi.fn> } {
  const requestRender = vi.fn();
  const state = {
    sources: { clusterBulk: null },
    subsystems: { scheduler: { requestRender } },
    assetSlots: {},
  } as unknown as EngineState;
  return { state, requestRender };
}

const noopCb = {} as EngineCallbacks;

describe('createClusterCatalogSlot', () => {
  it('writes the payload to state on ready', async () => {
    const payload = fakePayload();
    mockFetch.mockResolvedValue(payload);
    const { state, requestRender } = fakeState();

    const slot = createClusterCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The WHOLE payload (catalog + meta) lands in state, not just .meta —
    // the bulk POI builder needs both halves.
    expect(state.sources.clusterBulk).toBe(payload);
    expect(requestRender).toHaveBeenCalled();
    expect(state.assetSlots.clusterCatalog).toBe(slot);
  });

  it('writes null on error and warns', async () => {
    // A 404 is a permanent failure under defaultRetryPolicy → give-up
    // immediately (no slow backoff), so the slot reaches 'error' at once.
    mockFetch.mockRejectedValue(new HttpError(404, 'clusters.ccat'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { state } = fakeState();

    const slot = createClusterCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));

    expect(state.sources.clusterBulk).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

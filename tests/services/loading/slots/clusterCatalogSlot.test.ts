/**
 * clusterCatalogSlot — verifies the slot wakes the renderer on a successful
 * load and degrades gracefully on fetch failure.
 *
 * The slot has no GPU commit and owns no state — `wireStructureProjection`
 * subscribes to the same slot and consumes the ready value.  So the only
 * observable behaviour here is a `requestRender()` wake on ready and a warn
 * on error.  We mock the fetcher module so `slot.load()` drives a
 * deterministic ready/error transition without touching the network.
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

// Minimal fake state — the slot only touches
// `subsystems.scheduler.requestRender`. `as never` lets us hand the factory
// a stub without modelling the whole EngineState tree.
function fakeState(): { state: EngineState; requestRender: ReturnType<typeof vi.fn> } {
  const requestRender = vi.fn();
  const state = {
    subsystems: { scheduler: { requestRender } },
    assetSlots: {},
  } as unknown as EngineState;
  return { state, requestRender };
}

const noopCb = {} as EngineCallbacks;

describe('createClusterCatalogSlot', () => {
  it('wakes the renderer on ready', async () => {
    const payload = fakePayload();
    mockFetch.mockResolvedValue(payload);
    const { state, requestRender } = fakeState();

    const slot = createClusterCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The slot owns no state — it only wakes the renderer so the bulk
    // markers (fed by wireStructureProjection from the same ready value) get drawn.
    expect(requestRender).toHaveBeenCalled();
    // Construction purity: the factory RETURNS the slot and does NOT
    // self-install it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('cluster-catalog');
    expect(state.assetSlots.clusterCatalog).toBeUndefined();
  });

  it('warns on error', async () => {
    // A 404 is a permanent failure under defaultRetryPolicy → give-up
    // immediately (no slow backoff), so the slot reaches 'error' at once.
    mockFetch.mockRejectedValue(new HttpError(404, 'clusters.ccat'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { state } = fakeState();

    const slot = createClusterCatalogSlot(state, noopCb);
    slot.load({});
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

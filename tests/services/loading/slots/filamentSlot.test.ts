/**
 * filamentSlot — verifies the slot uploads the skeleton to the renderer and
 * records its durable load status on the filament store.
 *
 * The slot's observable effects on `ready` are: the GPU upload, a
 * `filaments.setLoaded(strip, vert)` write to the store (the authoritative
 * status home), the `onReady` UI echo, and a `requestRender()` wake. We mock
 * the fetcher so `slot.load()` drives a deterministic ready transition without
 * touching the network.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FilamentCloud } from '../../../../src/@types/data/FilamentCloud';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/filamentFetcher', () => ({
  filamentFetcher: mockFetch,
}));

import { createFilamentSlot } from '../../../../src/services/loading/slots/filamentSlot';

function fakeCloud(): FilamentCloud {
  return {
    stripCount: 12,
    vertexCount: 3400,
    stripOffsets: new Uint32Array([0, 3400]),
    vertices: new Float32Array(4),
  };
}

// Minimal fake state — the slot touches the fade registry, the filament
// renderer, the filament store, and the scheduler. `as never` lets us hand the
// factory a stub without modelling the whole EngineState tree.
function fakeState(): { state: EngineState; requestRender: ReturnType<typeof vi.fn> } {
  const requestRender = vi.fn();
  const state = {
    settings: { filaments: { enabled: true, intensity: 1 } },
    data: createEngineData(),
    subsystems: {
      fades: { register: vi.fn(), fadeTo: vi.fn(async () => {}) },
      scheduler: { requestRender },
    },
    gpu: { filamentRenderer: { upload: vi.fn() } },
    assetSlots: {},
  } as unknown as EngineState;
  return { state, requestRender };
}

const noopCb = {} as EngineCallbacks;

describe('createFilamentSlot', () => {
  it('records load status on the filament store on ready', async () => {
    const cloud = fakeCloud();
    mockFetch.mockResolvedValue(cloud);
    const { state, requestRender } = fakeState();

    const slot = createFilamentSlot(state, noopCb);
    slot.load({ tier: 'medium' } as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The durable status lands on the store, sourced from the decoded counts.
    expect(state.data.filaments.loaded).toBe(true);
    expect(state.data.filaments.stripCount).toBe(12);
    expect(state.data.filaments.vertexCount).toBe(3400);
    expect(requestRender).toHaveBeenCalled();
    // Construction purity: the factory RETURNS the slot and does NOT
    // self-install it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('filaments');
    expect(state.assetSlots.filaments).toBeUndefined();
  });

  it('echoes the parsed counts to the UI callback', async () => {
    const cloud = fakeCloud();
    mockFetch.mockResolvedValue(cloud);
    const { state } = fakeState();
    const onReady = vi.fn();
    const cb = { filaments: { onReady } } as unknown as EngineCallbacks;

    const slot = createFilamentSlot(state, cb);
    slot.load({ tier: 'medium' } as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(onReady).toHaveBeenCalledWith(12, 3400);
  });
});

/**
 * filamentSlot — verifies the slot uploads the skeleton to the renderer and
 * echoes its parsed counts to the UI.
 *
 * The slot's observable effects on `ready` are: the GPU upload, the first-load
 * fade-in driven through the intent → fade bridge, and the `onReady` UI echo.
 * There is no status store — "loaded" is the slot's own `ready` state; the counts
 * flow out through `onReady`, never back through a getter. The render wake is
 * handled generically by `installSlotReadyWake` in the wiring layer. We mock the
 * fetcher so `slot.load()` drives a deterministic ready transition without
 * touching the network, and mock the bridge to a typed spy so we assert the
 * commit's `{ animate: true, only: ['filaments'] }` call without the real
 * per-row fade walk.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FilamentCloud } from '../../../../src/@types/data/filament/FilamentCloud';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/filamentFetcher', () => ({
  filamentFetcher: mockFetch,
}));

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

import { createFilamentSlot } from '../../../../src/services/loading/slots/filamentSlot';

const bridge = vi.mocked(syncVisibilityFades);

function fakeCloud(): FilamentCloud {
  return {
    stripCount: 12,
    vertexCount: 3400,
    stripOffsets: new Uint32Array([0, 3400]),
    vertices: new Float32Array(4),
  };
}

// Minimal fake state — the slot touches the fade registry, the filament
// renderer, and the filament store. `as never` lets us hand the factory a stub
// without modelling the whole EngineState tree.
function fakeState(): EngineState {
  return {
    settings: { filaments: { enabled: true, intensity: 1 } },
    data: createEngineData(),
    subsystems: {
      fades: { register: vi.fn(), fadeTo: vi.fn(async () => {}) },
    },
    gpu: { filamentRenderer: { upload: vi.fn() } },
    assetSlots: {},
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createFilamentSlot', () => {
  it('uploads the skeleton to the renderer and reaches ready', async () => {
    const cloud = fakeCloud();
    mockFetch.mockResolvedValue(cloud);
    const state = fakeState();

    const slot = createFilamentSlot(state, noopCb);
    slot.load({ tier: 'medium' } as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The decoded cloud lands on the GPU via the renderer upload; the slot's own
    // `ready` state is the authoritative "loaded" bit (no status store mirror).
    expect(state.gpu.filamentRenderer!.upload).toHaveBeenCalledWith(cloud);
    // The first-load fade-in routes through the bridge, scoped to the filaments row.
    expect(bridge).toHaveBeenCalledWith(state, { animate: true, only: ['filaments'] });
    // Construction purity: the factory RETURNS the slot and does NOT
    // self-install it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('filaments');
    expect(state.assetSlots.filaments).toBeUndefined();
  });

  it('echoes the parsed counts to the UI callback', async () => {
    const cloud = fakeCloud();
    mockFetch.mockResolvedValue(cloud);
    const state = fakeState();
    const onReady = vi.fn();
    const cb = { filaments: { onReady } } as unknown as EngineCallbacks;

    const slot = createFilamentSlot(state, cb);
    slot.load({ tier: 'medium' } as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(onReady).toHaveBeenCalledWith(12, 3400);
  });
});

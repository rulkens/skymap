/**
 * earthTextureSlot — verifies the slot re-skins the placeholder Earth by
 * handing the fetched bitmap to the renderer's `setTexture` on `ready`, and
 * that the destroy-race (renderer nulled before the fetch resolves) is a silent
 * no-op rather than a crash.
 *
 * The slot's only observable effect on `ready` is the `setTexture` call — there
 * is no `syncVisibilityFades` (the Earth sphere is already on-screen as the
 * placeholder; the texture swap is not a visibility fade) and no manual
 * `requestRender` (the generic `installSlotReadyWake` owns the wake). We mock
 * the fetcher so `slot.load()` drives a deterministic ready transition without
 * touching the network.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';

// Hoisted mock target — `vi.mock` runs before imports, so the fetcher
// reference has to live in a hoisted block the factory closure can see.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../../src/services/loading/fetchers/earthTextureFetcher', () => ({
  earthTextureFetcher: mockFetch,
}));

import { createEarthTextureSlot } from '../../../../src/services/loading/slots/earthTextureSlot';

function fakeBitmap(): ImageBitmap {
  return { width: 4096, height: 2048 } as unknown as ImageBitmap;
}

// Minimal fake state — the slot touches only the earth renderer's `setTexture`.
// `as unknown` lets us hand the factory a stub without modelling the whole
// EngineState tree.
function fakeState(earthRenderer: { setTexture: (b: ImageBitmap) => void } | null): EngineState {
  return {
    gpu: { earthRenderer },
    assetSlots: {},
  } as unknown as EngineState;
}

const noopCb = {} as EngineCallbacks;

describe('createEarthTextureSlot', () => {
  it('sets the fetched bitmap on the earth renderer on ready', async () => {
    const bitmap = fakeBitmap();
    mockFetch.mockResolvedValue(bitmap);
    const setTexture = vi.fn<(b: ImageBitmap) => void>();
    const state = fakeState({ setTexture });

    const slot = createEarthTextureSlot(state, noopCb);
    slot.load(undefined as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The decoded bitmap re-skins the placeholder Earth via the renderer.
    expect(setTexture).toHaveBeenCalledWith(bitmap);
    // Construction purity: the factory RETURNS the slot and does NOT self-install
    // it — `installSlots` (the orchestrator) owns the write.
    expect(slot.name).toBe('earthTexture');
    expect(state.assetSlots.earthTexture).toBeUndefined();
  });

  it('commit is a no-op when the earth renderer is null', async () => {
    // The destroy race: `destroy()` nulled the handle before the fetch
    // resolved. The commit's `?.` makes this a silent no-op — the bug the old
    // IIFE's half-guarded `?.` only partially covered. The slot still reaches
    // `ready` and nothing throws.
    mockFetch.mockResolvedValue(fakeBitmap());
    const state = fakeState(null);

    const slot = createEarthTextureSlot(state, noopCb);
    slot.load(undefined as never);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
  });
});

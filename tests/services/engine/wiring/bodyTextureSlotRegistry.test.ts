/**
 * bodyTextureSlotRegistry — mint + commit-dispatch tests for the keyed
 * `bodyTextures` slot family.
 *
 * Structural: every family key gets a slot in `state.assetSlots.bodyTextures`.
 * Behavioural: commit routes each key to its resident renderer — `'earth'` to
 * `earthRenderer.setTexture`, every other (non-ring) body to
 * `texturedBodyRenderer.setTexture(bodyId, …)` — and a non-Earth body's
 * onRelease frees its texture via `texturedBodyRenderer.clearTexture`. Driven
 * through the real slot machinery with a stubbed fetch + decode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireBodyTextureSlots } from '../../../../src/services/engine/wiring/bodyTextureSlotRegistry';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { useFetchMock } from '../../../setup/fetchMock';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const fetch = useFetchMock();

type Gpu = {
  earthRenderer: { setTexture: ReturnType<typeof vi.fn> };
  texturedBodyRenderer: {
    setTexture: ReturnType<typeof vi.fn>;
    clearTexture: ReturnType<typeof vi.fn>;
    setRingTexture: ReturnType<typeof vi.fn>;
  };
};

function makeState(gpu: Gpu): EngineState {
  return {
    gpu,
    assetSlots: { bodyTextures: new Map() },
  } as unknown as EngineState;
}

function makeGpu(): Gpu {
  return {
    earthRenderer: { setTexture: vi.fn() },
    texturedBodyRenderer: { setTexture: vi.fn(), clearTexture: vi.fn(), setRingTexture: vi.fn() },
  };
}

describe('wireBodyTextureSlots', () => {
  let originalCreateImageBitmap: typeof globalThis.createImageBitmap | undefined;
  const bitmap = { __bitmap: true } as unknown as ImageBitmap;

  beforeEach(() => {
    originalCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue(bitmap) as unknown as typeof globalThis.createImageBitmap;
    fetch.mock.mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));
  });

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap!;
  });

  it('mints one slot per textured body + the ring', () => {
    const state = makeState(makeGpu());
    wireBodyTextureSlots(state);
    expect(new Set(state.assetSlots.bodyTextures.keys())).toEqual(new Set(ALL_BODY_TEXTURE_KEYS));
    // Sanity: 13 bodies + the Saturn ring.
    expect(state.assetSlots.bodyTextures.size).toBe(14);
  });

  it("the 'earth' slot's commit dispatches the bitmap to earthRenderer.setTexture", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('earth')!;
    slot.load({ bodyId: 'earth', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(gpu.earthRenderer.setTexture).toHaveBeenCalledTimes(1);
    expect(gpu.earthRenderer.setTexture).toHaveBeenCalledWith(bitmap);
    // Earth keeps its own renderer — the shared textured renderer is untouched.
    expect(gpu.texturedBodyRenderer.setTexture).not.toHaveBeenCalled();
  });

  it("a non-'earth' body slot's commit dispatches to texturedBodyRenderer.setTexture(bodyId, …)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('mars')!;
    slot.load({ bodyId: 'mars', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(gpu.texturedBodyRenderer.setTexture).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.setTexture).toHaveBeenCalledWith('mars', bitmap);
    // Mars is not Earth's — Earth's renderer stays untouched.
    expect(gpu.earthRenderer.setTexture).not.toHaveBeenCalled();
  });

  it("a non-'earth' body slot's onRelease frees its texture via texturedBodyRenderer.clearTexture", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('mars')!;
    slot.load({ bodyId: 'mars', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    // Eviction: releasing the slot must actually free Mars's GPU texture.
    slot.release();
    expect(gpu.texturedBodyRenderer.clearTexture).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.clearTexture).toHaveBeenCalledWith('mars');
  });

  it("the ring slot's commit dispatches to texturedBodyRenderer.setRingTexture(hostBody, …)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('saturn-ring')!;
    slot.load({ bodyId: 'saturn-ring', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The ring strip binds to its HOST body (saturn) via setRingTexture — the
    // sphere setTexture path is untouched, and Earth's renderer stays clear.
    expect(gpu.texturedBodyRenderer.setRingTexture).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.setRingTexture).toHaveBeenCalledWith('saturn', bitmap);
    expect(gpu.texturedBodyRenderer.setTexture).not.toHaveBeenCalled();
    expect(gpu.earthRenderer.setTexture).not.toHaveBeenCalled();
  });
});

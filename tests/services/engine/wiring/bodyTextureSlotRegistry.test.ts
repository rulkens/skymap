/**
 * bodyTextureSlotRegistry — mint + commit-dispatch tests for the keyed
 * `bodyTextures` slot family.
 *
 * Structural: every family key gets a slot in `state.assetSlots.bodyTextures`.
 * Behavioural: commit routes each entry to its resident renderer — `'earth'` to
 * `earthRenderer.setMap(kind, …)`, every other (non-ring) body to
 * `texturedBodyRenderer.setMap(bodyId, kind, …)` — and a non-Earth body's
 * onRelease frees its texture via `texturedBodyRenderer.clearMap(bodyId, kind)`,
 * per-kind so the slot's `kind` flows through. Driven through the real slot
 * machinery with a stubbed fetch + decode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireBodyTextureSlots } from '../../../../src/services/engine/wiring/bodyTextureSlotRegistry';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { bodyTextureSlotKey } from '../../../../src/utils/scene/bodyTextureSlotKey';
import { useFetchMock } from '../../../setup/fetchMock';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const fetch = useFetchMock();

type Gpu = {
  earthRenderer: { setMap: ReturnType<typeof vi.fn> };
  cloudShellRenderer: { setTexture: ReturnType<typeof vi.fn> };
  texturedBodyRenderer: {
    setMap: ReturnType<typeof vi.fn>;
    clearMap: ReturnType<typeof vi.fn>;
    setRingTexture: ReturnType<typeof vi.fn>;
  };
  atmosphereShellRenderer: { setRingTexture: ReturnType<typeof vi.fn> };
};

function makeState(gpu: Gpu): EngineState {
  return {
    gpu,
    assetSlots: { bodyTextures: new Map() },
  } as unknown as EngineState;
}

function makeGpu(): Gpu {
  return {
    earthRenderer: { setMap: vi.fn() },
    cloudShellRenderer: { setTexture: vi.fn() },
    texturedBodyRenderer: { setMap: vi.fn(), clearMap: vi.fn(), setRingTexture: vi.fn() },
    atmosphereShellRenderer: { setRingTexture: vi.fn() },
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
    fetch.mock.mockResolvedValue(
      new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
  });

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap!;
  });

  it('mints one slot per textured body + the ring', () => {
    const state = makeState(makeGpu());
    wireBodyTextureSlots(state);
    expect(new Set(state.assetSlots.bodyTextures.keys())).toEqual(
      new Set(ALL_BODY_TEXTURE_KEYS.map((e) => bodyTextureSlotKey(e.bodyId, e.kind))),
    );
  });

  it("the 'earth:surface' slot's commit dispatches the bitmap to earthRenderer.setMap", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('earth:surface')!;
    slot.load({ bodyId: 'earth', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(gpu.earthRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(gpu.earthRenderer.setMap).toHaveBeenCalledWith('surface', bitmap);
    // Earth keeps its own renderer — the shared textured renderer is untouched.
    expect(gpu.texturedBodyRenderer.setMap).not.toHaveBeenCalled();
    // The surface kind is NOT a cloud map — the shell stays clear.
    expect(gpu.cloudShellRenderer.setTexture).not.toHaveBeenCalled();
  });

  it("the 'earth:clouds' slot's commit fans ONE bitmap to both the surface renderer and the cloud shell", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('earth:clouds')!;
    slot.load({ bodyId: 'earth', kind: 'clouds', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // One committed cloud bitmap reaches BOTH resident consumers: the surface
    // pipeline (shadow + night occlusion) and the translucent shell.
    expect(gpu.earthRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(gpu.earthRenderer.setMap).toHaveBeenCalledWith('clouds', bitmap);
    expect(gpu.cloudShellRenderer.setTexture).toHaveBeenCalledTimes(1);
    expect(gpu.cloudShellRenderer.setTexture).toHaveBeenCalledWith(bitmap);
  });

  it("a non-'earth' body slot's commit dispatches to texturedBodyRenderer.setMap(bodyId, 'surface', …)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('mars:surface')!;
    slot.load({ bodyId: 'mars', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(gpu.texturedBodyRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.setMap).toHaveBeenCalledWith('mars', 'surface', bitmap);
    // Mars is not Earth's — Earth's renderer stays untouched.
    expect(gpu.earthRenderer.setMap).not.toHaveBeenCalled();
  });

  it("the 'moon:normal' slot's commit routes to texturedBodyRenderer.setMap('moon','normal', …)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('moon:normal')!;
    slot.load({ bodyId: 'moon', kind: 'normal', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The Prep-B kind routing must carry the NEW `normal` kind through verbatim —
    // this fails the moment the commit collapses `kind` back to `'surface'`.
    expect(gpu.texturedBodyRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.setMap).toHaveBeenCalledWith('moon', 'normal', bitmap);
    expect(gpu.texturedBodyRenderer.setMap).not.toHaveBeenCalledWith('moon', 'surface', bitmap);
    // The Moon is not Earth's — Earth's renderer stays untouched.
    expect(gpu.earthRenderer.setMap).not.toHaveBeenCalled();
  });

  it("a non-'earth' body slot's onRelease frees its texture via texturedBodyRenderer.clearMap(bodyId, kind)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('mars:surface')!;
    slot.load({ bodyId: 'mars', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    // Eviction: releasing the slot must actually free Mars's GPU texture — and
    // per-KIND, so the slot's `kind` flows through. This fails the moment the
    // release collapses to a per-body clear that would destroy a sibling kind.
    slot.release();
    expect(gpu.texturedBodyRenderer.clearMap).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.clearMap).toHaveBeenCalledWith('mars', 'surface');
  });

  it("the ring slot's commit dispatches to texturedBodyRenderer.setRingTexture(hostBody, …)", async () => {
    const gpu = makeGpu();
    const state = makeState(gpu);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('saturn-ring:surface')!;
    slot.load({ bodyId: 'saturn-ring', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The ring strip binds to its HOST body (saturn) via setRingTexture — the
    // sphere setMap path is untouched, and Earth's renderer stays clear.
    expect(gpu.texturedBodyRenderer.setRingTexture).toHaveBeenCalledTimes(1);
    expect(gpu.texturedBodyRenderer.setRingTexture).toHaveBeenCalledWith('saturn', bitmap);
    // …and fans out to the atmosphere shell's ring-in-front occlusion binding,
    // keyed on the same host body.
    expect(gpu.atmosphereShellRenderer.setRingTexture).toHaveBeenCalledTimes(1);
    expect(gpu.atmosphereShellRenderer.setRingTexture).toHaveBeenCalledWith('saturn', bitmap);
    expect(gpu.texturedBodyRenderer.setMap).not.toHaveBeenCalled();
    expect(gpu.earthRenderer.setMap).not.toHaveBeenCalled();
  });
});

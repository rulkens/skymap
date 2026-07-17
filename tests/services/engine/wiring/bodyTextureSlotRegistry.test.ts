/**
 * bodyTextureSlotRegistry — mint + commit-dispatch tests for the keyed
 * `bodyTextures` slot family.
 *
 * Structural: every family key gets a slot in `state.assetSlots.bodyTextures`.
 * Behavioural: the `'earth'` slot's commit dispatches to `earthRenderer.setTexture`
 * (the one resident target this plan), driven through the real slot machinery
 * with a stubbed fetch + decode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireBodyTextureSlots } from '../../../../src/services/engine/wiring/bodyTextureSlotRegistry';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/data/bodies/bodyTextureKeys';
import { useFetchMock } from '../../../setup/fetchMock';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const fetch = useFetchMock();

function makeState(setTexture: ReturnType<typeof vi.fn>): EngineState {
  return {
    gpu: { earthRenderer: { setTexture } },
    assetSlots: { bodyTextures: new Map() },
  } as unknown as EngineState;
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
    const state = makeState(vi.fn());
    wireBodyTextureSlots(state);
    expect(new Set(state.assetSlots.bodyTextures.keys())).toEqual(new Set(ALL_BODY_TEXTURE_KEYS));
    // Sanity: 13 bodies + the Saturn ring.
    expect(state.assetSlots.bodyTextures.size).toBe(14);
  });

  it("the 'earth' slot's commit dispatches the bitmap to earthRenderer.setTexture", async () => {
    const setTexture = vi.fn();
    const state = makeState(setTexture);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('earth')!;
    slot.load({ bodyId: 'earth', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(setTexture).toHaveBeenCalledTimes(1);
    expect(setTexture).toHaveBeenCalledWith(bitmap);
  });

  it("a non-'earth' slot commits harmlessly (no resident target this plan)", async () => {
    const setTexture = vi.fn();
    const state = makeState(setTexture);
    wireBodyTextureSlots(state);

    const slot = state.assetSlots.bodyTextures.get('mars')!;
    slot.load({ bodyId: 'mars', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // Earth's renderer is untouched — Mars has no resident target until Plan 02.
    expect(setTexture).not.toHaveBeenCalled();
  });
});

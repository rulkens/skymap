/**
 * bodyTextureSlots — commit-dispatch tests for the body Layer's texture slots: commit
 * routes each entry to its renderers — `'earth'` to `earth.setMap(kind, …)`, every
 * other (non-ring) body to `texturedBody.setMap(bodyId, kind, …)`, a ring strip to
 * its three consumers — and a non-Earth body's onRelease frees its texture via
 * `texturedBody.clearMap(bodyId, kind)`, per-kind so the slot's `kind` flows
 * through. Driven through the real slot machinery with a stubbed fetch + decode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBodyTextureSlots } from '../../../../src/layers/body/load/bodyTextureSlots';
import { useFetchMock } from '../../../setup/fetchMock';
import type { BodyTextureSinks } from '../../../../src/layers/body/@types/BodyTextureSinks';

const fetch = useFetchMock();

function makeSinks() {
  return {
    earthRenderer: { setMap: vi.fn(), clearMap: vi.fn() },
    cloudShellRenderer: { setTexture: vi.fn(), clearTexture: vi.fn() },
    texturedBodyRenderer: { setMap: vi.fn(), clearMap: vi.fn(), setRingTexture: vi.fn() },
    ringRenderer: { setTexture: vi.fn() },
    atmosphereShellRenderer: { setRingTexture: vi.fn() },
  };
}

describe('createBodyTextureSlots', () => {
  let originalCreateImageBitmap: typeof globalThis.createImageBitmap | undefined;
  let bitmap: ImageBitmap;

  beforeEach(() => {
    bitmap = { __bitmap: true, close: vi.fn() } as unknown as ImageBitmap;
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

  it("the 'earth:clouds' slot's commit fans ONE bitmap to both the surface renderer and the cloud shell", async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('earth:clouds')!;
    slot.load({ bodyId: 'earth', kind: 'clouds', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // One committed cloud bitmap reaches BOTH resident consumers: the surface
    // pipeline (shadow + night occlusion) and the translucent shell.
    expect(sinks.earthRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(sinks.earthRenderer.setMap).toHaveBeenCalledWith('clouds', bitmap);
    expect(sinks.cloudShellRenderer.setTexture).toHaveBeenCalledTimes(1);
    expect(sinks.cloudShellRenderer.setTexture).toHaveBeenCalledWith(bitmap);
  });

  it("the 'moon:normal' slot's commit routes to texturedBody.setMap('moon','normal', …)", async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('moon:normal')!;
    slot.load({ bodyId: 'moon', kind: 'normal', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // Fails if the commit collapses `kind` back to `'surface'`.
    expect(sinks.texturedBodyRenderer.setMap).toHaveBeenCalledTimes(1);
    expect(sinks.texturedBodyRenderer.setMap).toHaveBeenCalledWith('moon', 'normal', bitmap);
    expect(sinks.texturedBodyRenderer.setMap).not.toHaveBeenCalledWith('moon', 'surface', bitmap);
    expect(sinks.earthRenderer.setMap).not.toHaveBeenCalled();
  });

  it("a non-'earth' body slot's onRelease frees its texture via texturedBody.clearMap(bodyId, kind)", async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('mars:surface')!;
    slot.load({ bodyId: 'mars', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    // Per-KIND release: a per-body clear would destroy a sibling kind.
    slot.release();
    expect(sinks.texturedBodyRenderer.clearMap).toHaveBeenCalledTimes(1);
    expect(sinks.texturedBodyRenderer.clearMap).toHaveBeenCalledWith('mars', 'surface');
  });

  it("releasing 'earth:clouds' frees both copies: Earth's map and the cloud shell's", async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('earth:clouds')!;
    slot.load({ bodyId: 'earth', kind: 'clouds', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(sinks.earthRenderer.clearMap).toHaveBeenCalledWith('clouds');
    expect(sinks.cloudShellRenderer.clearTexture).toHaveBeenCalledOnce();
    expect(sinks.texturedBodyRenderer.clearMap).not.toHaveBeenCalled();
  });

  // Every sink copies the bitmap into its own texture, so a decoded copy kept past
  // commit (up to 128 MiB at 8k) only doubles the map's footprint.
  it('closes the bitmap once every sink has copied it', async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('earth:clouds')!;
    slot.load({ bodyId: 'earth', kind: 'clouds', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(bitmap.close).toHaveBeenCalledOnce();
    const closedAt = (bitmap.close as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(sinks.cloudShellRenderer.setTexture.mock.invocationCallOrder[0]!).toBeLessThan(closedAt);
  });

  it('closes a bitmap superseded before it reached any sink', async () => {
    const stale = { close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(globalThis.createImageBitmap)
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(bitmap);
    // One Response per call: a body can be read once.
    fetch.mock.mockImplementation(() =>
      Promise.resolve(
        new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
      ),
    );
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get('mars:surface')!;
    void slot.load({ bodyId: 'mars', kind: 'surface', tier: 'small' });
    await slot.load({ bodyId: 'mars', kind: 'surface', tier: 'medium' });

    expect(stale.close).toHaveBeenCalledOnce();
    expect(sinks.texturedBodyRenderer.setMap).not.toHaveBeenCalledWith('mars', 'surface', stale);
  });

  it('the ring strip lands in the ring, textured-body and atmosphere renderers', async () => {
    const sinks = makeSinks();
    const slot = createBodyTextureSlots(sinks as unknown as BodyTextureSinks).get(
      'saturn-ring:surface',
    )!;
    slot.load({ bodyId: 'saturn-ring', kind: 'surface', tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(sinks.texturedBodyRenderer.setRingTexture).toHaveBeenCalledTimes(1);
    expect(sinks.texturedBodyRenderer.setRingTexture).toHaveBeenCalledWith('saturn', bitmap);
    expect(sinks.ringRenderer.setTexture).toHaveBeenCalledWith(bitmap);
    expect(sinks.atmosphereShellRenderer.setRingTexture).toHaveBeenCalledTimes(1);
    expect(sinks.atmosphereShellRenderer.setRingTexture).toHaveBeenCalledWith('saturn', bitmap);
    expect(sinks.texturedBodyRenderer.setMap).not.toHaveBeenCalled();
    expect(sinks.earthRenderer.setMap).not.toHaveBeenCalled();
  });
});

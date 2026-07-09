/**
 * Tests for `createRenderTargets` — the single owner of every offscreen
 * `RenderTargetSpec` row's texture lifecycle (the HDR + half-res volume
 * targets that used to live in `postProcess.ts` / `volumeOffscreen.ts`).
 *
 * Vitest runs in Node without a real GPU, so `device.createTexture` is
 * mocked; each mock returns a fresh `{ createView, destroy }` pair so the
 * resize / destroy tests can detect view replacement and per-texture
 * teardown by call count.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRenderTargets } from '../../../src/services/gpu/renderTargets';

function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
  } as unknown as GPUDevice;
}

const SWAP_FORMAT: GPUTextureFormat = 'bgra8unorm';

describe('createRenderTargets', () => {
  it('viewOf returns a live view per offscreen row and throws for swap', () => {
    const targets = createRenderTargets(mockDevice(), SWAP_FORMAT, { width: 800, height: 600 });
    // Offscreen rows resolve to a live view.
    expect(targets.viewOf('hdr')).toBeDefined();
    expect(targets.viewOf('volume')).toBeDefined();
    // The swap chain is executor-resolved from the acquired frame view, not
    // allocated here — so it (and any unknown id) throws.
    expect(() => targets.viewOf('swap')).toThrow();
    expect(() => targets.viewOf('nope')).toThrow();
  });

  it('resize reallocates offscreen textures at size/scale', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(device, SWAP_FORMAT, { width: 900, height: 600 });

    // Construction allocated the two offscreen rows (hdr @ scale 1, volume @
    // scale 3): 2 textures. hdr at full size, volume at floor(size/3).
    expect(create.mock.calls).toHaveLength(2);
    const hdrDesc = create.mock.calls.find((c) => c[0].label === 'render-target-hdr')![0];
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    expect(hdrDesc.size).toEqual({ width: 900, height: 600 });
    expect(volDesc.size).toEqual({ width: 300, height: 200 });
    expect(hdrDesc.format).toBe('rgba16float');
    expect(volDesc.format).toBe('rgba16float');

    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    targets.resize({ width: 1200, height: 900 });

    // Each offscreen row reallocated at the new size/scale → 2 more textures.
    expect(create.mock.calls).toHaveLength(4);
    const hdrResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-hdr')
      .at(-1)![0];
    const volResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-volume')
      .at(-1)![0];
    expect(hdrResized.size).toEqual({ width: 1200, height: 900 });
    expect(volResized.size).toEqual({ width: 400, height: 300 });
    // New views replaced the old ones.
    expect(targets.viewOf('hdr')).not.toBe(hdrViewBefore);
    expect(targets.viewOf('volume')).not.toBe(volViewBefore);
  });

  it('clamps volume to a 1 px minimum when floor(size/scale) is 0', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    createRenderTargets(device, SWAP_FORMAT, { width: 2, height: 2 });
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    // floor(2 / 3) = 0 → clamped up to 1.
    expect(volDesc.size).toEqual({ width: 1, height: 1 });
  });

  it('specs carry the spec format/depth/scale table', () => {
    const targets = createRenderTargets(mockDevice(), SWAP_FORMAT, { width: 800, height: 600 });
    const byId = new Map(targets.specs.map((s) => [s.id, s]));
    expect(byId.get('hdr')).toEqual({ id: 'hdr', format: 'rgba16float', depth: null, scale: 1 });
    expect(byId.get('volume')).toEqual({
      id: 'volume',
      format: 'rgba16float',
      depth: null,
      scale: 3,
    });
    // The swap row carries the swap-chain format handed in at construction.
    expect(byId.get('swap')).toEqual({ id: 'swap', format: SWAP_FORMAT, depth: null, scale: 1 });
  });

  it('destroy destroys every allocated texture', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(device, SWAP_FORMAT, { width: 800, height: 600 });
    targets.destroy();
    // Both offscreen textures had destroy() called.
    for (const result of create.mock.results) {
      expect(result.value.destroy).toHaveBeenCalled();
    }
    // After destroy, offscreen views are gone → viewOf throws.
    expect(() => targets.viewOf('hdr')).toThrow();
  });
});

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

    // Construction allocated the offscreen rows: hdr @ scale 1 (colour),
    // volume @ scale 3 (colour), and foreground:0 @ scale 1 (colour + depth)
    // → 4 textures. hdr at full size, volume at floor(size/3).
    expect(create.mock.calls).toHaveLength(4);
    const hdrDesc = create.mock.calls.find((c) => c[0].label === 'render-target-hdr')![0];
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    expect(hdrDesc.size).toEqual({ width: 900, height: 600 });
    expect(volDesc.size).toEqual({ width: 300, height: 200 });
    expect(hdrDesc.format).toBe('rgba16float');
    expect(volDesc.format).toBe('rgba16float');

    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    targets.resize({ width: 1200, height: 900 });

    // Each offscreen row reallocated at the new size/scale → 4 more textures.
    expect(create.mock.calls).toHaveLength(8);
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

  it('allocates and resizes a depth texture alongside colour for rows that declare depth', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(device, SWAP_FORMAT, { width: 800, height: 600 });

    // foreground:0 declares depth → two textures at full resolution: an
    // rgba16float colour attachment and a depth32float depth attachment.
    const fgColour = create.mock.calls.find((c) => c[0].label === 'render-target-foreground:0')![0];
    const fgDepth = create.mock.calls.find(
      (c) => c[0].label === 'render-target-foreground:0-depth',
    )![0];
    expect(fgColour.format).toBe('rgba16float');
    expect(fgColour.size).toEqual({ width: 800, height: 600 });
    expect(fgDepth.format).toBe('depth32float');
    expect(fgDepth.size).toEqual({ width: 800, height: 600 });
    // Depth is never sampled downstream — RENDER_ATTACHMENT only, no
    // TEXTURE_BINDING (contrast the colour attachment, which the compositor
    // samples).
    expect(fgDepth.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT);

    const depthCallsBefore = create.mock.calls.filter(
      (c) => c[0].label === 'render-target-foreground:0-depth',
    ).length;
    targets.resize({ width: 1024, height: 768 });
    // Resize reallocates both the colour and the depth texture at the new size.
    const fgDepthResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-foreground:0-depth')
      .at(-1)![0];
    expect(fgDepthResized.size).toEqual({ width: 1024, height: 768 });
    expect(
      create.mock.calls.filter((c) => c[0].label === 'render-target-foreground:0-depth').length,
    ).toBe(depthCallsBefore + 1);
  });

  it('depthViewOf returns the depth view for foreground:0 and throws for depthless rows and swap', () => {
    const targets = createRenderTargets(mockDevice(), SWAP_FORMAT, { width: 800, height: 600 });
    // The one row that declares depth resolves to a live depth view.
    expect(targets.depthViewOf('foreground:0')).toBeDefined();
    // Depthless offscreen rows have no depth attachment.
    expect(() => targets.depthViewOf('hdr')).toThrow();
    expect(() => targets.depthViewOf('volume')).toThrow();
    // swap is executor-resolved and has no depth either; unknown ids throw too.
    expect(() => targets.depthViewOf('swap')).toThrow();
    expect(() => targets.depthViewOf('nope')).toThrow();
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

  it('destroy destroys depth textures alongside colour', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(device, SWAP_FORMAT, { width: 800, height: 600 });
    const depthResult = create.mock.results.find(
      (_r, i) => create.mock.calls[i]![0].label === 'render-target-foreground:0-depth',
    )!;
    targets.destroy();
    // The depth texture was torn down like every colour texture.
    expect(depthResult.value.destroy).toHaveBeenCalled();
    // After destroy the depth view is gone → depthViewOf throws.
    expect(() => targets.depthViewOf('foreground:0')).toThrow();
  });
});

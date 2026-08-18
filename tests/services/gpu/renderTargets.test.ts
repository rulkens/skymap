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

// The `mw-aggregate` row's divisor is a caller-supplied live knob, not a table
// constant. These tests are about allocation mechanics, so they pass the boot
// value and the row behaves like any other fixed-scale row.
const MW_DIVISOR = 2;

describe('createRenderTargets', () => {
  it('viewOf returns a live view per offscreen row and throws for swap', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
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
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 900, height: 600 },
      MW_DIVISOR,
    );

    // Construction allocated the offscreen rows: hdr @ scale 1 (colour),
    // volume @ scale 3 (colour), zoa @ scale 5 (colour), star-aggregates @
    // scale 2 (colour), mw-aggregate @ scale 2 (colour), foreground:0 @
    // scale 1 (colour + depth), and the five bloom-pyramid mips
    // bloom0..bloom4 @ scale 2/4/8/16/32 (colour only) → 12 textures. hdr at
    // full size, volume at floor(size/3), star-aggregates and mw-aggregate
    // at floor(size/2).
    expect(create.mock.calls).toHaveLength(12);
    const hdrDesc = create.mock.calls.find((c) => c[0].label === 'render-target-hdr')![0];
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    const aggDesc = create.mock.calls.find(
      (c) => c[0].label === 'render-target-star-aggregates',
    )![0];
    expect(hdrDesc.size).toEqual({ width: 900, height: 600 });
    expect(volDesc.size).toEqual({ width: 300, height: 200 });
    expect(aggDesc.size).toEqual({ width: 450, height: 300 });
    expect(hdrDesc.format).toBe('rgba16float');
    expect(volDesc.format).toBe('rgba16float');
    expect(aggDesc.format).toBe('rgba16float');

    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    const aggViewBefore = targets.viewOf('star-aggregates');
    targets.resize({ width: 1200, height: 900 });

    // Each offscreen row reallocated at the new size/scale → 12 more textures.
    expect(create.mock.calls).toHaveLength(24);
    const hdrResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-hdr')
      .at(-1)![0];
    const volResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-volume')
      .at(-1)![0];
    const aggResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-star-aggregates')
      .at(-1)![0];
    expect(hdrResized.size).toEqual({ width: 1200, height: 900 });
    expect(volResized.size).toEqual({ width: 400, height: 300 });
    expect(aggResized.size).toEqual({ width: 600, height: 450 });
    // New views replaced the old ones.
    expect(targets.viewOf('hdr')).not.toBe(hdrViewBefore);
    expect(targets.viewOf('volume')).not.toBe(volViewBefore);
    expect(targets.viewOf('star-aggregates')).not.toBe(aggViewBefore);
  });

  it('clamps volume to a 1 px minimum when floor(size/scale) is 0', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    createRenderTargets(device, SWAP_FORMAT, { width: 2, height: 2 }, MW_DIVISOR);
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    // floor(2 / 3) = 0 → clamped up to 1.
    expect(volDesc.size).toEqual({ width: 1, height: 1 });
  });

  it('allocates and resizes a depth texture alongside colour for rows that declare depth', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );

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
    // Depth carries RENDER_ATTACHMENT (feeds the depth-test) AND
    // TEXTURE_BINDING — the near-field caption occlusion pass samples this
    // depth (via lib/sceneDepth.wesl) to hide captions behind nearer bodies.
    // Guards that the depth stays sampleable, which the occlusion feature relies on.
    expect(fgDepth.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);

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
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
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
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
    targets.destroy();
    // Both offscreen textures had destroy() called.
    for (const result of create.mock.results) {
      expect(result.value.destroy).toHaveBeenCalled();
    }
    // After destroy, offscreen views are gone → viewOf throws.
    expect(() => targets.viewOf('hdr')).toThrow();
  });

  it("setSwapFormat replaces the swap row's format and leaves offscreen rows alone", () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );

    const specsBefore = targets.specs;
    const hdrSpecBefore = specsBefore.find((s) => s.id === 'hdr')!;
    const volSpecBefore = specsBefore.find((s) => s.id === 'volume')!;
    const fgSpecBefore = specsBefore.find((s) => s.id === 'foreground:0')!;
    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    const fgViewBefore = targets.viewOf('foreground:0');
    const callsBefore = create.mock.calls.length;

    targets.setSwapFormat('rgba16float');

    // The swap row's format changed...
    const swapSpec = targets.specs.find((s) => s.id === 'swap')!;
    expect(swapSpec.format).toBe('rgba16float');
    // ...via a new specs array (house preference for immutability)...
    expect(targets.specs).not.toBe(specsBefore);
    // ...but every offscreen row is the SAME spec object — untouched, not
    // rebuilt — and has no new texture allocated (the swap row carries no
    // texture, so this is allocation-free).
    expect(targets.specs.find((s) => s.id === 'hdr')).toBe(hdrSpecBefore);
    expect(targets.specs.find((s) => s.id === 'volume')).toBe(volSpecBefore);
    expect(targets.specs.find((s) => s.id === 'foreground:0')).toBe(fgSpecBefore);
    expect(create.mock.calls.length).toBe(callsBefore);
    expect(targets.viewOf('hdr')).toBe(hdrViewBefore);
    expect(targets.viewOf('volume')).toBe(volViewBefore);
    expect(targets.viewOf('foreground:0')).toBe(fgViewBefore);
  });

  it('specOf returns the declared row and throws for an unknown id', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
    expect(targets.specOf('hdr').id).toBe('hdr');
    expect(() => targets.specOf('nope')).toThrow();
  });

  it('sizeOf returns the allocated pixel size of an offscreen row and throws for swap', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 900, height: 600 },
      MW_DIVISOR,
    );
    // volume @ scale 3 -> floor(900/3), floor(600/3); zoa @ scale 5 ->
    // floor(900/5), floor(600/5).
    expect(targets.sizeOf('volume')).toEqual({ width: 300, height: 200 });
    expect(targets.sizeOf('zoa')).toEqual({ width: 180, height: 120 });
    expect(() => targets.sizeOf('swap')).toThrow();
    expect(() => targets.sizeOf('nope')).toThrow();
  });

  // Relocated from `scalarVolumeLayer.test.ts` / `zoneOfAvoidanceLayer.test.ts`
  // once those layers stopped computing the viewport inline — the clamp now
  // lives only here, on the `sizeOf` reader path. `renderTargets.test.ts`'s
  // 'clamps volume to a 1 px minimum' case above covers the same clamp on the
  // ALLOCATION path (the `createTexture` descriptor); this is the reader.
  it('sizeOf clamps to a 1 px minimum when floor(size/scale) is 0', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 2, height: 2 },
      MW_DIVISOR,
    );
    // floor(2 / 3) = 0 -> clamped up to 1.
    expect(targets.sizeOf('volume')).toEqual({ width: 1, height: 1 });
  });

  // Two independently maintained tables (the spec rows and their clear
  // values) were merged onto one this rung — a row that lost its clear value
  // in that merge would otherwise be silent (every field but this one has a
  // fallback-free type, so a typo would surface as a tsc error instead).
  it('every declared row carries a clearValue', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
    for (const spec of targets.specs) {
      expect(spec.clearValue).toBeDefined();
    }
  });

  it('destroy destroys depth textures alongside colour', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      MW_DIVISOR,
    );
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

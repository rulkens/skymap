/**
 * Tests for `createRenderTargets` — the single owner of every offscreen
 * `RenderTargetSpec` row's texture lifecycle (the HDR + half-res volume
 * targets that used to live in `postProcess.ts` / `volumeOffscreen.ts`).
 *
 * Vitest runs in Node without a real GPU, so `device.createTexture` is
 * mocked; each mock returns a fresh `{ createView, destroy }` pair so the
 * reconcile / destroy tests can detect view replacement and per-texture
 * teardown by call count.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRenderTargets } from '../../../src/services/gpu/renderTargets';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { RenderTargetSpec } from '../../../src/@types/engine/frame/RenderTargetSpec';

function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
  } as unknown as GPUDevice;
}

const SWAP_FORMAT: GPUTextureFormat = 'bgra8unorm';

// The `mw-aggregate` row's divisor arrives off `state`, not the table. Most of
// these tests are about allocation mechanics, so they hand over the boot value
// and the row behaves like any other fixed-scale row.
const MW_DIVISOR = 2;

function stateWithDivisor(aggregateDivisor: number): EngineState {
  return { settings: { milkyWay: { aggregateDivisor } } } as unknown as EngineState;
}

// `fixedSizePx` has no row in the production table yet (Phase B adds the
// real sky-cubemap row); `createRenderTargets`'s 5th `extraRows` param is a
// test-only injection seam so the allocation branch can be exercised now.
// No production caller passes it.
const FIXED_SIZE_ROW: RenderTargetSpec = {
  id: 'test:cubemap',
  format: 'rgba16float',
  depth: null,
  scale: 1,
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
  fixedSizePx: { size: 256, layers: 6 },
};

describe('createRenderTargets', () => {
  it('viewOf returns a live view per offscreen row and throws for swap', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );
    // Offscreen rows resolve to a live view.
    expect(targets.viewOf('hdr')).toBeDefined();
    expect(targets.viewOf('volume')).toBeDefined();
    // The swap chain is executor-resolved from the acquired frame view, not
    // allocated here — so it (and any unknown id) throws.
    expect(() => targets.viewOf('swap')).toThrow();
    expect(() => targets.viewOf('nope')).toThrow();
  });

  it('reconcile reallocates every offscreen row when the canvas size changes', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 900, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );

    // Construction allocated the offscreen rows: hdr @ scale 1 (colour),
    // volume @ scale 3 (colour), zoa @ scale 5 (colour), star-aggregates @
    // scale 2 (colour), mw-aggregate @ scale 2 (colour), foreground:0 @
    // scale 1 (colour + depth), the five bloom-pyramid mips bloom0..bloom4 @
    // scale 2/4/8/16/32 (colour only), and sky-cubemap @ fixedSizePx (colour)
    // → 13 textures. hdr at full size, volume at floor(size/3),
    // star-aggregates and mw-aggregate at floor(size/2).
    expect(create.mock.calls).toHaveLength(13);
    const hdrDesc = create.mock.calls.find((c) => c[0].label === 'render-target-hdr')![0];
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    const aggDesc = create.mock.calls.find(
      (c) => c[0].label === 'render-target-star-aggregates',
    )![0];
    expect(hdrDesc.size).toEqual({ width: 900, height: 600, depthOrArrayLayers: 1 });
    expect(volDesc.size).toEqual({ width: 300, height: 200, depthOrArrayLayers: 1 });
    expect(aggDesc.size).toEqual({ width: 450, height: 300, depthOrArrayLayers: 1 });
    expect(hdrDesc.format).toBe('rgba16float');
    expect(volDesc.format).toBe('rgba16float');
    expect(aggDesc.format).toBe('rgba16float');

    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    const aggViewBefore = targets.viewOf('star-aggregates');
    targets.reconcile(stateWithDivisor(MW_DIVISOR), { width: 1200, height: 900 });

    // Each SCALE-driven offscreen row reallocated at the new canvas size → 12
    // more textures; sky-cubemap's fixedSizePx row holds its declared size
    // and is not one of them.
    expect(create.mock.calls).toHaveLength(25);
    const hdrResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-hdr')
      .at(-1)![0];
    const volResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-volume')
      .at(-1)![0];
    const aggResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-star-aggregates')
      .at(-1)![0];
    expect(hdrResized.size).toEqual({ width: 1200, height: 900, depthOrArrayLayers: 1 });
    expect(volResized.size).toEqual({ width: 400, height: 300, depthOrArrayLayers: 1 });
    expect(aggResized.size).toEqual({ width: 600, height: 450, depthOrArrayLayers: 1 });
    // New views replaced the old ones.
    expect(targets.viewOf('hdr')).not.toBe(hdrViewBefore);
    expect(targets.viewOf('volume')).not.toBe(volViewBefore);
    expect(targets.viewOf('star-aggregates')).not.toBe(aggViewBefore);
  });

  it('a fixedSizePx row allocates at its declared size regardless of canvas size', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 900, height: 600 },
      stateWithDivisor(MW_DIVISOR),
      [FIXED_SIZE_ROW],
    );

    const desc = create.mock.calls.find((c) => c[0].label === 'render-target-test:cubemap')![0];
    expect(desc.size).toEqual({ width: 256, height: 256, depthOrArrayLayers: 6 });
    expect(desc.dimension).toBe('2d');
  });

  it('cubeViewOf returns a dimension:cube view for a 6-layer row and throws for a non-cube row', () => {
    const device = mockDevice();
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
      [FIXED_SIZE_ROW],
    );
    expect(targets.cubeViewOf('test:cubemap')).toBeDefined();
    // 'hdr' has no fixedSizePx (a single layer), so it gets no cube view.
    expect(() => targets.cubeViewOf('hdr')).toThrow();
    expect(() => targets.cubeViewOf('nope')).toThrow();
  });

  it('reconcile does not reallocate a fixedSizePx row when the canvas resizes', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 900, height: 600 },
      stateWithDivisor(MW_DIVISOR),
      [FIXED_SIZE_ROW],
    );
    const callsBefore = create.mock.calls.filter(
      (c) => c[0].label === 'render-target-test:cubemap',
    ).length;

    targets.reconcile(stateWithDivisor(MW_DIVISOR), { width: 1200, height: 900 });

    const callsAfter = create.mock.calls.filter(
      (c) => c[0].label === 'render-target-test:cubemap',
    ).length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("reconcile reallocates a row whose state-driven scale moved and leaves the other rows' views untouched", () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(2),
    );

    const hdrViewBefore = targets.viewOf('hdr');
    const volViewBefore = targets.viewOf('volume');
    const callsBefore = create.mock.calls.length;

    // The divisor is a DebugPanel slider, but a texture's dimensions are fixed
    // at creation — so the only way a drag reaches the screen is this row's
    // `scale` resolving to a new number and its texture being replaced.
    targets.reconcile(stateWithDivisor(4), { width: 800, height: 600 });

    const mwResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-mw-aggregate')
      .at(-1)![0];
    expect(mwResized.size).toEqual({ width: 200, height: 150, depthOrArrayLayers: 1 });
    expect(targets.sizeOf('mw-aggregate')).toEqual({ width: 200, height: 150 });
    // Exactly one row moved: one new texture, and every other row's view is
    // still the object its consumers resolved before the call.
    expect(create.mock.calls.length).toBe(callsBefore + 1);
    expect(targets.viewOf('hdr')).toBe(hdrViewBefore);
    expect(targets.viewOf('volume')).toBe(volViewBefore);
  });

  it('reconcile allocates nothing when neither the canvas size nor a resolved scale moved', () => {
    // Comparing against what the textures actually hold (rather than a 'last
    // applied' field) has to SETTLE, or every steady-state frame would throw
    // away and re-allocate every offscreen target.
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );
    const callsBefore = create.mock.calls.length;

    targets.reconcile(stateWithDivisor(MW_DIVISOR), { width: 800, height: 600 });

    expect(create.mock.calls.length).toBe(callsBefore);
  });

  it('clamps volume to a 1 px minimum when floor(size/scale) is 0', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    createRenderTargets(device, SWAP_FORMAT, { width: 2, height: 2 }, stateWithDivisor(MW_DIVISOR));
    const volDesc = create.mock.calls.find((c) => c[0].label === 'render-target-volume')![0];
    // floor(2 / 3) = 0 → clamped up to 1.
    expect(volDesc.size).toEqual({ width: 1, height: 1, depthOrArrayLayers: 1 });
  });

  it('allocates and resizes a depth texture alongside colour for rows that declare depth', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );

    // foreground:0 declares depth → two textures at full resolution: an
    // rgba16float colour attachment and a depth32float depth attachment.
    const fgColour = create.mock.calls.find((c) => c[0].label === 'render-target-foreground:0')![0];
    const fgDepth = create.mock.calls.find(
      (c) => c[0].label === 'render-target-foreground:0-depth',
    )![0];
    expect(fgColour.format).toBe('rgba16float');
    expect(fgColour.size).toEqual({ width: 800, height: 600, depthOrArrayLayers: 1 });
    expect(fgDepth.format).toBe('depth32float');
    expect(fgDepth.size).toEqual({ width: 800, height: 600, depthOrArrayLayers: 1 });
    // Depth carries ONLY RENDER_ATTACHMENT (feeds the depth-test) — nothing
    // samples it downstream any more (each painter-chain row clears its own
    // depth, spec §7.3, so it can't back a cross-row occlusion test).
    expect(fgDepth.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT);
    // Colour carries RENDER_ATTACHMENT AND TEXTURE_BINDING — the caption
    // occlusion pass samples its ALPHA (via lib/sceneDepth.wesl) to hide
    // captions behind an opaque body. Guards that the colour texture stays
    // sampleable, which the occlusion feature now relies on.
    expect(fgColour.usage).toBe(
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    );

    const depthCallsBefore = create.mock.calls.filter(
      (c) => c[0].label === 'render-target-foreground:0-depth',
    ).length;
    targets.reconcile(stateWithDivisor(MW_DIVISOR), { width: 1024, height: 768 });
    // Reconcile reallocates the colour AND the depth texture at the new size.
    const fgDepthResized = create.mock.calls
      .filter((c) => c[0].label === 'render-target-foreground:0-depth')
      .at(-1)![0];
    expect(fgDepthResized.size).toEqual({ width: 1024, height: 768, depthOrArrayLayers: 1 });
    expect(
      create.mock.calls.filter((c) => c[0].label === 'render-target-foreground:0-depth').length,
    ).toBe(depthCallsBefore + 1);
  });

  it('depthViewOf returns the depth view for foreground:0 and throws for depthless rows and swap', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
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
      stateWithDivisor(MW_DIVISOR),
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
      stateWithDivisor(MW_DIVISOR),
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
      stateWithDivisor(MW_DIVISOR),
    );
    expect(targets.specOf('hdr').id).toBe('hdr');
    expect(() => targets.specOf('nope')).toThrow();
  });

  it('sizeOf returns the allocated pixel size of an offscreen row and throws for swap', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 900, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );
    // volume @ scale 3 -> floor(900/3), floor(600/3); zoa @ scale 5 ->
    // floor(900/5), floor(600/5).
    expect(targets.sizeOf('volume')).toEqual({ width: 300, height: 200 });
    expect(targets.sizeOf('zoa')).toEqual({ width: 180, height: 120 });
    expect(() => targets.sizeOf('swap')).toThrow();
    expect(() => targets.sizeOf('nope')).toThrow();
  });

  // The clamp on the `sizeOf` READER path — the 'clamps volume to a 1 px
  // minimum' case above covers the same clamp on the ALLOCATION path (the
  // `createTexture` descriptor).
  it('sizeOf clamps to a 1 px minimum when floor(size/scale) is 0', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 2, height: 2 },
      stateWithDivisor(MW_DIVISOR),
    );
    // floor(2 / 3) = 0 -> clamped up to 1.
    expect(targets.sizeOf('volume')).toEqual({ width: 1, height: 1 });
  });

  // `clearValue` is a required field, so a row silently losing it in a future
  // edit is already a tsc error — not what this guards. What tsc cannot
  // catch is a row's clearValue landing on the WRONG alpha (e.g. a=0 row
  // copy-pasted from `hdr` keeping its a=1): `hdr`/`swap` are the only two
  // rows that clear opaque; every other row must clear to zero coverage so
  // its upsample/composite adds nothing for a fragment it didn't reach.
  it('only hdr and swap clear to opaque alpha', () => {
    const targets = createRenderTargets(
      mockDevice(),
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
    );
    for (const spec of targets.specs) {
      const expectedAlpha = spec.id === 'hdr' || spec.id === 'swap' ? 1 : 0;
      // Every row in this table is written as a `{r,g,b,a}` dict (never the
      // 4-tuple alternative `GPUColor` also allows), so this cast is safe.
      const clearValue = spec.clearValue as GPUColorDict;
      expect(clearValue.a).toBe(expectedAlpha);
    }
  });

  it('destroy destroys depth textures alongside colour', () => {
    const device = mockDevice();
    const create = device.createTexture as ReturnType<typeof vi.fn>;
    const targets = createRenderTargets(
      device,
      SWAP_FORMAT,
      { width: 800, height: 600 },
      stateWithDivisor(MW_DIVISOR),
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

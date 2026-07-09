/**
 * initGpu.destroyReachability — guards that GPU-owning renderers are
 * reachable from the teardown chain.
 *
 * ### What this protects
 *
 * `texturedDiskRenderer`, `proceduralDiskRenderer`, `milkyWayCloud`,
 * `milkyWayCloudRenderer`, and `horizonShellRenderer` each own GPU
 * resources and expose
 * `.destroy()`. They must live on `state.gpu.*` (alongside `renderer`,
 * `pickRenderer`, `renderTargets`, …) so `engine.ts.destroy()` has a
 * reachable reference to each — otherwise every HMR / StrictMode remount
 * leaks their GPU buffers.
 *
 * ### What this test asserts
 *
 *   1. After `initGpu(state, deps)`, each renderer field on `state.gpu.*`
 *      holds the constructed renderer (not null/undefined).
 *   2. Replaying the `engine.ts.destroy()` chain —
 *      `state.gpu.<field>?.destroy()` for every handle in the bag —
 *      reaches each renderer's destroy spy.
 *
 * ### Why mock the heavy modules
 *
 * `initGpu` calls `gpuInitGpu(canvas)` (real WebGPU device acquisition),
 * `loadFontAtlases()` (network fetch), and the renderer constructors —
 * none of which work in JSDOM. Mocking them lets the phase body run to
 * completion so we can observe its writes to `state.gpu.*`. Each mock
 * returns a spy-bearing stub whose `destroy` we can assert was called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks ──────────────────────────────────────────────────────
//
// vi.mock is hoisted, so a per-mock factory stashes its spy objects in a
// module-scoped map the tests read. Each mock returns a stub shaped
// enough for `initGpu` to thread through: constructors return objects
// with `.destroy`, plus the few methods `initGpu` calls synchronously.

type Stub = {
  destroy: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  setBiasMode: ReturnType<typeof vi.fn>;
  setLabels: ReturnType<typeof vi.fn>;
};

const stubs: Record<string, Stub> = {};

function makeStub(name: string): Stub {
  const stub: Stub = {
    destroy: vi.fn(),
    // Methods `initGpu` invokes synchronously inside the phase.
    upload: vi.fn().mockResolvedValue(undefined),
    setBiasMode: vi.fn(),
    // `initGpu` calls `foregroundLabelRenderer.setLabels(debugSphereLabels())`
    // synchronously after constructing the second label renderer.
    setLabels: vi.fn(),
  };
  stubs[name] = stub;
  return stub;
}

vi.mock('../../../../src/services/gpu/device', () => ({
  initGpu: vi.fn(async () => ({
    device: { __mockDevice: true } as unknown as GPUDevice,
    context: { __mockContext: true } as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
  })),
  resizeCanvasToDisplay: vi.fn(),
}));

// The canonical BGLs are constructed in initGpu by calling
// createFadeUniformsBgl / createSourceUniformsBgl / createFocusUniformsBgl,
// all of which call device.createBindGroupLayout. The mock device returned
// by the gpuInitGpu mock is a plain object without WebGPU methods, so we
// mock the BGL factories directly instead of stubbing the device.
vi.mock('../../../../src/services/gpu/bindGroupLayouts/fadeUniforms', () => ({
  createFadeUniformsBgl: vi.fn(() => ({ __mockFadeBgl: true })),
}));
vi.mock('../../../../src/services/gpu/bindGroupLayouts/sourceUniforms', () => ({
  createSourceUniformsBgl: vi.fn(() => ({ __mockSourceBgl: true })),
}));
vi.mock('../../../../src/services/gpu/bindGroupLayouts/focusUniforms', () => ({
  createFocusUniformsBgl: vi.fn(() => ({ __mockFocusBgl: true })),
}));

// The shared focus uniform allocates a real GPU buffer; the minimal device
// stub here has no createBuffer, so mock the factory to a no-op handle.
vi.mock('../../../../src/services/gpu/resources/createFocusUniformBuffer', () => ({
  createFocusUniformBuffer: vi.fn(() => ({
    bindGroup: { __mockFocusBindGroup: true },
    write: () => {},
    destroy: () => {},
  })),
}));

vi.mock('../../../../src/services/gpu/renderers/pointRenderer', () => ({
  createPointRenderer: vi.fn(() => makeStub('pointRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderTargets', () => ({
  createRenderTargets: vi.fn(() => makeStub('renderTargets')),
}));

vi.mock('../../../../src/services/gpu/passes/compositor', () => ({
  createCompositor: vi.fn(() => makeStub('compositor')),
}));

vi.mock('../../../../src/services/gpu/renderers/texturedDiskRenderer', () => ({
  createTexturedDiskRenderer: vi.fn(() => makeStub('texturedDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/proceduralDiskRenderer', () => ({
  createProceduralDiskRenderer: vi.fn(() => makeStub('proceduralDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/horizonShellRenderer', () => ({
  createHorizonShellRenderer: vi.fn(() => makeStub('horizonShellRenderer')),
  // initGpu imports the FRAME program (for TIMED_SLOTS), which transitively
  // loads the content-layer registry incl. horizonShellLayer — that module
  // reads this const, so the mock must provide it.
  HORIZON_RADIUS_GPC: 14.3,
}));

vi.mock('../../../../src/services/gpu/renderers/filamentRenderer', () => ({
  createFilamentRenderer: vi.fn(() => makeStub('filamentRenderer')),
}));

vi.mock('../../../../src/services/gpu/galaxy/milkyWayCloud', () => ({
  createMilkyWayCloud: vi.fn(() => makeStub('milkyWayCloud')),
}));

vi.mock('../../../../src/services/gpu/renderers/milkyWayCloudRenderer', () => ({
  createMilkyWayCloudRenderer: vi.fn(() => makeStub('milkyWayCloudRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub('labelRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/markerLineRenderer', () => ({
  createMarkerLineRenderer: vi.fn(() => makeStub('markerLineRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/debugLineRenderer', () => ({
  createDebugLineRenderer: vi.fn(() => makeStub('debugLineRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/selectionRingRenderer', () => ({
  createSelectionRingRenderer: vi.fn(() => makeStub('selectionRingRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/structureMarkerRenderer', () => ({
  createStructureMarkerRenderer: vi.fn(() => makeStub('structureMarkerRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/milkyWayPickRenderer', () => ({
  createMilkyWayPickRenderer: vi.fn(() => makeStub('milkyWayPickRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/volumeFieldRenderer', () => ({
  createVolumeFieldRenderer: vi.fn(() => makeStub('volumeFieldRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/flowFieldRenderer', () => ({
  createFlowFieldRenderer: vi.fn(() => makeStub('flowFieldRenderer')),
}));

vi.mock('../../../../src/services/gpu/passes/volumeUpsample', () => ({
  createVolumeUpsample: vi.fn(() => makeStub('volumeUpsample')),
}));

vi.mock('../../../../src/services/gpu/passes/pickDebugOverlay', () => ({
  createPickDebugOverlay: vi.fn(() => makeStub('pickDebugOverlay')),
}));

vi.mock('../../../../src/services/gpu/passes/diskRadiusRing', () => ({
  createDiskRadiusRing: vi.fn(() => makeStub('diskRadiusRing')),
}));

// The debug-sphere renderer keeps its `?static` WESL imports out of JSDOM;
// mock it like the other renderer constructors so initGpu's foreground block
// runs to completion and writes onto `state.gpu.debugSphereRenderer`.
vi.mock('../../../../src/services/gpu/renderers/debugSphereRenderer', () => ({
  createDebugSphereRenderer: vi.fn(() => makeStub('debugSphereRenderer')),
}));

vi.mock('../../../../src/services/gpu/labels/loadFontAtlases', () => ({
  loadFontAtlases: vi.fn(async () => ({
    metricsByFont: { cormorant: { __mockMetrics: true } },
    bitmaps: [{ __mockBitmap: true } as unknown as ImageBitmap],
  })),
}));

// `wireGalaxyCatalogSourceSlot` mints AssetSlots that the engine never `.load()`s
// in this test, so the production helper is fine — but its module also
// imports several heavy fetcher modules.  Replace with a no-op so the
// initGpu body's per-source loop is harmless.
vi.mock('../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry', () => ({
  GALAXY_CATALOG_SOURCE_REGISTRY: [] as Array<unknown>,
  wireGalaxyCatalogSourceSlot: vi.fn(),
}));

// Imported AFTER the mocks so initGpu picks up the mocked dependencies.
import { initGpu } from '../../../../src/services/engine/phases/initGpu';
// The mocked label-renderer factory itself: the main `labelRenderer` and the
// foreground caption renderer are both built through it, so tests index its
// `mock.results` ordinally (call 0 = main, call 1 = foreground) to prove two
// DISTINCT instances land on state.gpu.* — the shared `stubs.labelRenderer`
// key is overwritten by the second call and cannot make that distinction.
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';

/**
 * Build a minimal `EngineState` covering the slices `initGpu` reads and
 * writes. Every nullable `gpu.*` handle starts at `null`; the
 * `subsystems` bag carries just the facades `initGpu` calls into
 * (`biasCorrection.attachRenderer`, `labelDirector.attachRenderers`).
 */
function makeState(): EngineState {
  return {
    gpu: {
      renderer: null,
      pickRenderer: null,
      milkyWayPickRenderer: null,
      renderTargets: null,
      compositor: null,
      filamentRenderer: null,
      labelRenderer: null,
      foregroundLabelRenderer: null,
      markerLineRenderer: null,
      selectionRingRenderer: null,
      structureMarkerRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayCloud: null,
      milkyWayCloudRenderer: null,
      horizonShellRenderer: null,
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      pickDebugOverlay: null,
      diskRadiusRing: null,
      debugSphereRenderer: null,
    },
    subsystems: {
      biasCorrection: {
        attachRenderer: vi.fn(),
        setMode: vi.fn().mockResolvedValue(undefined),
      },
      labelDirector: {
        attachRenderers: vi.fn(),
        registerProducer: vi.fn(),
        runFrame: vi.fn(),
      },
      scheduler: {
        requestRender: vi.fn(),
      },
    },
    settings: {},
    assetSlots: {
      points: new Map(),
    },
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: { store: { dispatch: vi.fn() } } as unknown as EngineCallbacks,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
  };
}

describe('initGpu — destroy reachability for thumbnail/disk/procedural-disk/milky-way renderers', () => {
  beforeEach(() => {
    // Clear the spy cache so each test sees fresh stubs. The vi.mock
    // factories run per-call, so the map repopulates as initGpu runs.
    for (const k of Object.keys(stubs)) delete stubs[k];
    // Reset the label-factory call history so `mock.results` indices are
    // deterministic within each test (call 0 = main, call 1 = foreground).
    vi.mocked(createLabelRenderer).mockClear();
  });

  it('writes texturedDiskRenderer/proceduralDiskRenderer/milkyWayCloudRenderer onto state.gpu.*', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Every GPU-owning renderer must reach `state.gpu.*` — that's the
    // reachability claim the destroy chain depends on.
    expect(state.gpu.texturedDiskRenderer).toBe(stubs.texturedDiskRenderer);
    expect(state.gpu.proceduralDiskRenderer).toBe(stubs.proceduralDiskRenderer);
    // The cloud + its renderer must also reach state.gpu.* so destroy() can
    // release the star/dust VBs + the shared uniform/corner buffers.
    expect(state.gpu.milkyWayCloud).toBe(stubs.milkyWayCloud);
    expect(state.gpu.milkyWayCloudRenderer).toBe(stubs.milkyWayCloudRenderer);
    expect(state.gpu.horizonShellRenderer).toBe(stubs.horizonShellRenderer);
  });

  it('writes compositor + renderTargets onto state.gpu.*', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Same reachability claim as the other GPU-resource owners: the
    // compositor's cached pipelines' uniform buffers need a live
    // `state.gpu.*` reference for the destroy chain to find.
    expect(state.gpu.compositor).toBe(stubs.compositor);
    // The render-target table owns the offscreen textures (hdr + volume
    // rows) — the destroy chain must reach it the same way.
    expect(state.gpu.renderTargets).toBe(stubs.renderTargets);
  });

  it('phaseLocals no longer carries the thumbnail/milky-way renderers — they live solely on state.gpu.*', async () => {
    // `phaseLocals` carries no renderer mirror: a renderer set on
    // `state.gpu.*` is visible to every later phase, so mirroring it onto
    // `deps.phaseLocals` would be a redundant hidden channel. This pins
    // that decision so a future "re-add phaseLocals mirror" can't sneak
    // back in.
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    expect(deps.phaseLocals).toBeDefined();
    // PhaseLocals is exactly { device, context } — no renderer fields.
    expect(deps.phaseLocals!).not.toHaveProperty('texturedDiskRenderer');
    expect(deps.phaseLocals!).not.toHaveProperty('proceduralDiskRenderer');
    expect(deps.phaseLocals!).not.toHaveProperty('milkyWayCloudRenderer');
    // The renderers are still reachable for destroy + consumption via state.gpu.*.
    expect(state.gpu.texturedDiskRenderer).toBe(stubs.texturedDiskRenderer);
    expect(state.gpu.proceduralDiskRenderer).toBe(stubs.proceduralDiskRenderer);
    expect(state.gpu.milkyWayCloudRenderer).toBe(stubs.milkyWayCloudRenderer);
  });

  it('replaying engine.ts.destroy() chain on state.gpu.* invokes each renderer.destroy()', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Reach into each handle the way `engine.ts.destroy()` does —
    // optional-chained `.destroy()` then a null-out. If initGpu wrote the
    // renderer to `state.gpu.*` and destroy() walks it, the destroy spy
    // must fire.
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayCloud?.destroy();
    state.gpu.milkyWayCloud = null;
    state.gpu.milkyWayCloudRenderer?.destroy();
    state.gpu.milkyWayCloudRenderer = null;
    state.gpu.horizonShellRenderer?.destroy();
    state.gpu.horizonShellRenderer = null;

    expect(stubs.texturedDiskRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.proceduralDiskRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.milkyWayCloud!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.milkyWayCloudRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.horizonShellRenderer!.destroy).toHaveBeenCalledTimes(1);

    // Symmetric null-out matches the rest of the bag — see
    // `EngineGpuHandles.d.ts`'s lifecycle docstring.
    expect(state.gpu.texturedDiskRenderer).toBeNull();
    expect(state.gpu.proceduralDiskRenderer).toBeNull();
    expect(state.gpu.milkyWayCloudRenderer).toBeNull();
    expect(state.gpu.horizonShellRenderer).toBeNull();
  });

  it('replaying the destroy chain reaches compositor.destroy() and renderTargets.destroy()', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    state.gpu.compositor?.destroy();
    state.gpu.compositor = null;
    state.gpu.renderTargets?.destroy();
    state.gpu.renderTargets = null;

    expect(stubs.compositor!.destroy).toHaveBeenCalledTimes(1);
    expect(state.gpu.compositor).toBeNull();
    expect(stubs.renderTargets!.destroy).toHaveBeenCalledTimes(1);
    expect(state.gpu.renderTargets).toBeNull();
  });

  it('writes debugSphereRenderer + foregroundLabelRenderer onto state.gpu.*', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // The foreground debug sphere must reach state.gpu.* so the destroy chain
    // can release its position VBO, index IBO, and uniform buffer.
    expect(state.gpu.debugSphereRenderer).toBe(stubs.debugSphereRenderer);
    // Both label renderers come from the same createLabelRenderer factory,
    // so index its call results ordinally: call 0 built the main
    // `labelRenderer`, call 1 the foreground caption renderer.  Asserting
    // each field against its OWN call result — plus the not.toBe below —
    // proves initGpu constructed two distinct instances rather than
    // aliasing one renderer onto both fields.
    const labelResults = vi.mocked(createLabelRenderer).mock.results;
    expect(labelResults).toHaveLength(2);
    expect(state.gpu.labelRenderer).toBe(labelResults[0]!.value);
    expect(state.gpu.foregroundLabelRenderer).toBe(labelResults[1]!.value);
    expect(state.gpu.foregroundLabelRenderer).not.toBe(state.gpu.labelRenderer);
    // The static Sun/Earth caption set is uploaded once, at construction,
    // onto the foreground renderer only.
    expect(state.gpu.foregroundLabelRenderer!.setLabels).toHaveBeenCalledTimes(1);
    expect(state.gpu.labelRenderer!.setLabels).not.toHaveBeenCalled();
  });

  it('replaying the destroy chain reaches debugSphereRenderer + foregroundLabelRenderer', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Capture the foreground label stub before nulling — it shares the
    // createLabelRenderer mock with the main labels, so we assert on the live
    // reference rather than a shared stubs key.
    const fgLabel = state.gpu.foregroundLabelRenderer;

    state.gpu.debugSphereRenderer?.destroy();
    state.gpu.debugSphereRenderer = null;
    state.gpu.foregroundLabelRenderer?.destroy();
    state.gpu.foregroundLabelRenderer = null;

    expect(stubs.debugSphereRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect((fgLabel as unknown as Stub).destroy).toHaveBeenCalledTimes(1);

    // Symmetric null-out matches the rest of the bag — see
    // `EngineGpuHandles.d.ts`'s lifecycle docstring.
    expect(state.gpu.debugSphereRenderer).toBeNull();
    expect(state.gpu.foregroundLabelRenderer).toBeNull();
  });

  it('destroy is safe when initGpu never ran — every state.gpu.* renderer is null and ?.destroy() no-ops', () => {
    // destroy() must tolerate "engine torn down before bootstrap
    // finished" — same contract every handle in this bag honours. No
    // initGpu call; just walk the destroy chain against the zero-state.
    const state = makeState();
    expect(() => {
      state.gpu.texturedDiskRenderer?.destroy();
      state.gpu.texturedDiskRenderer = null;
      state.gpu.proceduralDiskRenderer?.destroy();
      state.gpu.proceduralDiskRenderer = null;
      state.gpu.milkyWayCloudRenderer?.destroy();
      state.gpu.milkyWayCloudRenderer = null;
    }).not.toThrow();
  });
});

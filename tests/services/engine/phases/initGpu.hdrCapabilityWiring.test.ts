/**
 * initGpu.hdrCapabilityWiring — the HDR-capability listener wiring inside `initGpu`: boot dispatch,
 * re-dispatch on a live change, and that `phaseLocals.unwatchHdrCapability` survives a later throw.
 * Handle reachability/teardown is `gpuHandles/gpuHandleRegistry.test.ts`'s. Every renderer
 * constructor is mocked below purely so `initGpu` completes in JSDOM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// vi.mock is hoisted, so a per-mock factory stashes its spies in a module-scoped map the tests read.

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
    upload: vi.fn().mockResolvedValue(undefined),
    setBiasMode: vi.fn(),
    setLabels: vi.fn(),
  };
  stubs[name] = stub;
  return stub;
}

vi.mock('../../../../src/services/gpu/device', () => ({
  initGpu: vi.fn(async () => ({
    // `initGpu` constructs the real `createBloomPyramid(device, ...)`, so the stub device needs the
    // shader-module/sampler/layout/pipeline/buffer methods; the shader module carries
    // `getCompilationInfo` because `createShaderModuleWithDevLog` consumes it under vitest's DEV env.
    device: {
      __mockDevice: true,
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createSampler: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({})),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      // `trackGpuMemory` (installed by the real, un-mocked `initGpu` phase)
      // wraps both create calls on whatever device `gpu/device`'s mocked
      // `initGpu` hands back, so the stub needs this method too.
      createTexture: vi.fn(() => ({ destroy: vi.fn() })),
    } as unknown as GPUDevice,
    context: { __mockContext: true } as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    hdrCapable: false,
  })),
  resizeCanvasToDisplay: vi.fn(),
  // No-op cleanup; the dispatch-wiring tests recover the registered callback via `.mock.calls` and
  // invoke it directly.
  watchHdrCapability: vi.fn(() => () => {}),
}));

// initGpu builds the canonical BGLs via device.createBindGroupLayout, which the plain-object mock
// device lacks, so the BGL factories are mocked directly.
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

vi.mock('../../../../src/layers/galaxyCatalog/render/galaxyPointRenderer', () => ({
  createGalaxyPointRenderer: vi.fn(() => makeStub('galaxyPointRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderTargets', () => ({
  createRenderTargets: vi.fn(() => makeStub('renderTargets')),
  renderTargetRows: vi.fn(() => []),
}));

vi.mock('../../../../src/services/gpu/passes/compositor', () => ({
  createCompositor: vi.fn(() => makeStub('compositor')),
}));

vi.mock('../../../../src/layers/galaxyCatalog/render/texturedDiskRenderer', () => ({
  createTexturedDiskRenderer: vi.fn(() => makeStub('texturedDiskRenderer')),
}));

vi.mock('../../../../src/layers/galaxyCatalog/render/proceduralDiskRenderer', () => ({
  createProceduralDiskRenderer: vi.fn(() => makeStub('proceduralDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labels3d/label3DRenderer', () => ({
  createLabel3DRenderer: vi.fn(() => makeStub('label3DRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labels/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub('labelRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labels/labelPickRenderer', () => ({
  createLabelPickRenderer: vi.fn(() => makeStub('labelPickRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labels/markerLineRenderer', () => ({
  createMarkerLineRenderer: vi.fn(() => makeStub('markerLineRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/devTools/debugLineRenderer', () => ({
  createDebugLineRenderer: vi.fn(() => makeStub('debugLineRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/selectionRing/selectionRingRenderer', () => ({
  createSelectionRingRenderer: vi.fn(() => makeStub('selectionRingRenderer')),
}));

vi.mock('../../../../src/services/gpu/passes/additiveUpsample', () => ({
  createAdditiveUpsample: vi.fn(() => makeStub('additiveUpsample')),
}));

vi.mock('../../../../src/services/gpu/passes/pickDebugOverlay', () => ({
  createPickDebugOverlay: vi.fn(() => makeStub('pickDebugOverlay')),
}));

// The body pick renderer builds two r32uint pick pipelines (a dynamic-offset
// sphere path + an instanced point path) against the full device API the plain
// stub device can't service, so mock the factory like the other pick providers.
vi.mock('../../../../src/services/gpu/renderers/bodies/bodyPickRenderer', () => ({
  createBodyPickRenderer: vi.fn(() => makeStub('bodyPickRenderer')),
}));
// Partial mock: orbitTrailsPass.ts (loaded transitively via the frame program's registry) reads the
// real INSTANCE_FLOATS at module scope to size its staging buffer, so only the factory is stubbed.
vi.mock(
  '../../../../src/services/gpu/renderers/bodies/orbitTrailRenderer',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../src/services/gpu/renderers/bodies/orbitTrailRenderer')
    >()),
    createOrbitTrailRenderer: vi.fn(() => makeStub('orbitTrailRenderer')),
  }),
);

vi.mock('../../../../src/services/gpu/labelLayout/loadFontAtlases', () => ({
  loadFontAtlases: vi.fn(async () => ({
    metricsByFont: { cormorant: { __mockMetrics: true } },
    bitmaps: [{ __mockBitmap: true } as unknown as ImageBitmap],
  })),
}));

// The env-BRDF loader fetches its two static assets; mock it to the one thing
// the unmocked `createMeshBodyRenderer` asks of the texture — a view.
vi.mock('../../../../src/services/gpu/resources/loadEnvBrdfLut', () => ({
  loadEnvBrdfLut: vi.fn(
    async () => ({ createView: () => ({ __mockLutView: true }) }) as unknown as GPUTexture,
  ),
}));

import { initGpu } from '../../../../src/services/engine/phases/initGpu';
// The mocked `watchHdrCapability`: tests read `.mock.calls` to recover the callback `initGpu`
// actually registered and invoke it directly.
import { watchHdrCapability } from '../../../../src/services/gpu/device';
import { engineHdrCapabilityChanged } from '../../../../src/state/engine/engineSlice';
// The mocked `loadFontAtlases` itself: overridden to reject in one test below
// to prove `deps.phaseLocals.unwatchHdrCapability` survives a throw that
// happens AFTER the listener is registered but before `initGpu` returns.
import { loadFontAtlases } from '../../../../src/services/gpu/labelLayout/loadFontAtlases';
// The registry itself: derives the expected non-null / null key sets for the
// phase-split assertion below, rather than a hand-written key list that
// could drift from GPU_HANDLE_ROWS.
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import { STUB_COMPOSITION } from '../../../helpers/engine/stubComposition';

function makeState(): EngineState {
  return {
    gpu: {
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
      pickProgram: null,
      renderTargets: null,
      compositor: null,
      labelRendererCosmo: null,
      labelRendererNear: null,
      markerLineRendererNear: null,
      markerLineRendererCosmo: null,
      selectionRingRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      pickDebugOverlay: null,
      bodyPickRenderer: null,
      orbitTrailRenderer: null,
    },
    // Read by the `renderTargets` row's construct closure via
    // `composeRenderTargetRows`; no Layer targets in this fixture.
    layerTargets: [],
    subsystems: {
      cosmoLabelDirector: {
        attachRenderers: vi.fn(),
        registerProducer: vi.fn(),
        runFrame: vi.fn(),
      },
      foregroundLabelDirector: {
        attachRenderers: vi.fn(),
        registerProducer: vi.fn(),
        runFrame: vi.fn(),
      },
      scheduler: {
        requestRender: vi.fn(),
      },
    },
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: { store: { dispatch: vi.fn() } } as unknown as EngineCallbacks,
    composition: STUB_COMPOSITION,
    frameRef: { current: () => {} },
    handleRef: { current: null },
    allSlots: new Map(),
    selection: {
      resolvePick: () => null,
      extractRow: () => null,
      resolveFocusId: () => null,
      focusIdOf: () => null,
    },
  };
}

describe('initGpu — HDR capability dispatch wiring', () => {
  beforeEach(() => {
    // `watchHdrCapability` is a module-level mock shared across every test in
    // this file; clear its call history so `.mock.calls[0]` below indexes
    // THIS test's registration, not a previous test's leftover.
    vi.mocked(watchHdrCapability).mockClear();
  });

  it('dispatches the boot HDR-capability snapshot', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    expect(deps.cb.store.dispatch).toHaveBeenCalledWith(engineHdrCapabilityChanged(false));
  });

  it("invoking watchHdrCapability's registered callback re-dispatches with the new value", async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    const onChange = vi.mocked(watchHdrCapability).mock.calls[0]![0];
    onChange(true);

    expect(deps.cb.store.dispatch).toHaveBeenCalledWith(engineHdrCapabilityChanged(true));
  });

  it('publishes phaseLocals.unwatchHdrCapability even when a later step throws', async () => {
    // Guards against phaseLocals being assigned only at the very end of
    // initGpu: a throw between the listener registration and any later step
    // (here, the font-atlas fetch) would then leave `bootstrapDeps.phaseLocals`
    // undefined and `engine.ts`'s destroy() a no-op — the matchMedia listener
    // (and its closure over the store) leaks for the page's lifetime.
    vi.mocked(loadFontAtlases).mockRejectedValueOnce(new Error('font atlas fetch failed'));
    const state = makeState();
    const deps = makeDeps();

    await expect(initGpu(state, deps)).rejects.toThrow('font atlas fetch failed');

    expect(deps.phaseLocals?.unwatchHdrCapability).toBeTypeOf('function');
  });
});

describe('initGpu — GPU_HANDLE_ROWS phase split', () => {
  it('constructs every row except the wireInput-phase rows, which stay null', async () => {
    // Emptying or widening initGpu's row filter (or wireInput's complement)
    // must fail here: this is what the stub round-trip test in
    // gpuHandleRegistry.test.ts structurally cannot see (it stubs every
    // row's construct and never runs either phase's filter).
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    const gpu = state.gpu as unknown as Record<string, unknown>;
    for (const row of GPU_HANDLE_ROWS) {
      if ('constructPhase' in row) {
        expect(gpu[row.key]).toBeNull();
      } else {
        // `toBeTruthy`, not `.not.toBeNull()`: several keys start `undefined`
        // (absent from the fixture literal below), and `undefined` would
        // pass a bare not-null check without ever running `construct`.
        expect(gpu[row.key]).toBeTruthy();
      }
    }
  });
});

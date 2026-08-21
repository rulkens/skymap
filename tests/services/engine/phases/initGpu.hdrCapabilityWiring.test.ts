/**
 * initGpu.hdrCapabilityWiring — the HDR-capability listener wiring inside
 * `initGpu`: boot dispatch, re-dispatch on a live change, and that
 * `phaseLocals.unwatchHdrCapability` survives a later throw. GPU-handle
 * reachability/teardown, formerly this file's other describe block, now
 * lives in `gpuHandles/gpuHandleRegistry.test.ts` (a construct/destroy
 * round-trip against the real `GPU_HANDLE_ROWS` table). Every renderer
 * constructor stays mocked below purely so `initGpu` completes in JSDOM.
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
  setStars: ReturnType<typeof vi.fn>;
  pickResources: ReturnType<typeof vi.fn>;
};

const stubs: Record<string, Stub> = {};

function makeStub(name: string): Stub {
  const stub: Stub = {
    destroy: vi.fn(),
    // Methods `initGpu` invokes synchronously inside the phase.
    upload: vi.fn().mockResolvedValue(undefined),
    setBiasMode: vi.fn(),
    // `initGpu` never calls `setLabels` itself — `foregroundLabelsLayer`
    // uploads the live caption set on its own first draw. Kept on the stub
    // shape because other stubbed renderers built from the same factory
    // expose the method.
    setLabels: vi.fn(),
    // The `starPointRenderer` row's construct closure (gpuHandleRegistry.ts)
    // calls `setStars(<the seeded star list>)` synchronously right after
    // constructing the renderer.
    setStars: vi.fn(),
    // The `starCatalogPickRenderer` row's construct closure calls
    // `starCatalogRenderer.pickResources()` synchronously to hand the pick
    // twin its shared BGLs + the per-source records bind-group lookup. The
    // pick factory is itself mocked here, so this only needs to be a
    // callable returning the resource shape.
    pickResources: vi.fn(() => ({
      cameraBgl: { __mockStarCameraBgl: true },
      drawBgl: { __mockStarDrawBgl: true },
      recordsBgl: { __mockStarRecordsBgl: true },
      recordsBindGroup: () => null,
    })),
  };
  stubs[name] = stub;
  return stub;
}

vi.mock('../../../../src/services/gpu/device', () => ({
  initGpu: vi.fn(async () => ({
    // `initGpu` constructs the real `createBloomPyramid(device, ...)` (it is not
    // mocked like the renderer factories), which builds four shader modules,
    // a sampler, a shared bind-group layout + pipeline layout, four render
    // pipelines, and the per-level uniform buffers. The plain stub device needs
    // those methods or construction throws. Each returns a minimal stub; the
    // shader module carries `getCompilationInfo` because `createShaderModuleWithDevLog`
    // consumes it under vitest's DEV env.
    device: {
      __mockDevice: true,
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createSampler: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({})),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    } as unknown as GPUDevice,
    context: { __mockContext: true } as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    hdrCapable: false,
  })),
  resizeCanvasToDisplay: vi.fn(),
  // Returns a no-op cleanup so boot doesn't need a real matchMedia listener;
  // the dispatch-wiring tests below recover the registered callback via
  // `.mock.calls` and invoke it directly to exercise the re-dispatch path.
  watchHdrCapability: vi.fn(() => () => {}),
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

vi.mock('../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointRenderer', () => ({
  createGalaxyPointRenderer: vi.fn(() => makeStub('galaxyPointRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderTargets', () => ({
  createRenderTargets: vi.fn(() => makeStub('renderTargets')),
}));

vi.mock('../../../../src/services/gpu/passes/compositor', () => ({
  createCompositor: vi.fn(() => makeStub('compositor')),
}));

vi.mock('../../../../src/services/gpu/renderers/galaxyCatalog/texturedDiskRenderer', () => ({
  createTexturedDiskRenderer: vi.fn(() => makeStub('texturedDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/galaxyCatalog/proceduralDiskRenderer', () => ({
  createProceduralDiskRenderer: vi.fn(() => makeStub('proceduralDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/horizonShell/horizonShellRenderer', () => ({
  createHorizonShellRenderer: vi.fn(() => makeStub('horizonShellRenderer')),
  // initGpu imports the FRAME program (for TIMED_SLOTS), which transitively
  // loads the content-layer registry incl. horizonShellLayer — that module
  // reads this const, so the mock must provide it.
  HORIZON_RADIUS_GPC: 14.3,
}));

vi.mock('../../../../src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer', () => ({
  createZoneOfAvoidanceRenderer: vi.fn(() => makeStub('zoneOfAvoidanceRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/filaments/filamentRenderer', () => ({
  createFilamentRenderer: vi.fn(() => makeStub('filamentRenderer')),
}));
vi.mock('../../../../src/services/gpu/renderers/constellations/constellationRenderer', () => ({
  createConstellationRenderer: vi.fn(() => makeStub('constellationRenderer')),
}));

vi.mock('../../../../src/services/engine/galaxyGenerator/v1/milkyWayCloud', () => ({
  createMilkyWayCloud: vi.fn(() => makeStub('milkyWayCloud')),
}));

vi.mock('../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer', () => ({
  createMilkyWayCloudRenderer: vi.fn(() => makeStub('milkyWayCloudRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labels/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub('labelRenderer')),
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

vi.mock('../../../../src/services/gpu/renderers/structureMarker/structureMarkerRenderer', () => ({
  createStructureMarkerRenderer: vi.fn(() => makeStub('structureMarkerRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/milkyWay/milkyWayPickRenderer', () => ({
  createMilkyWayPickRenderer: vi.fn(() => makeStub('milkyWayPickRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/volumeField/volumeFieldRenderer', () => ({
  createVolumeFieldRenderer: vi.fn(() => makeStub('volumeFieldRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/flowField/flowFieldRenderer', () => ({
  createFlowFieldRenderer: vi.fn(() => makeStub('flowFieldRenderer')),
}));

vi.mock('../../../../src/services/gpu/passes/additiveUpsample', () => ({
  createAdditiveUpsample: vi.fn(() => makeStub('additiveUpsample')),
}));

vi.mock('../../../../src/services/gpu/passes/starAggregateUpsample', () => ({
  createStarAggregateUpsample: vi.fn(() => makeStub('starAggregateUpsample')),
}));

vi.mock('../../../../src/services/gpu/passes/pickDebugOverlay', () => ({
  createPickDebugOverlay: vi.fn(() => makeStub('pickDebugOverlay')),
}));

vi.mock('../../../../src/services/gpu/renderers/devTools/diskRadiusRing', () => ({
  createDiskRadiusRing: vi.fn(() => makeStub('diskRadiusRing')),
}));

// The earth renderer keeps its `?static` WESL imports out of JSDOM; mock it
// so the `earthRenderer` row's construct closure (gpuHandleRegistry.ts)
// lands a stub on `state.gpu.earthRenderer` (the un-awaited Blue Marble
// fetch it fires runs after initGpu resolves and fails harmlessly in the
// test env).
vi.mock('../../../../src/services/gpu/renderers/bodies/earthRenderer', () => ({
  createEarthRenderer: vi.fn(() => makeStub('earthRenderer')),
}));

// The anchor renderers likewise keep their `?static` WESL imports out of
// JSDOM. createPlanetRenderer is called ONCE — a single dynamic-offset
// renderer draws every seeded planet (see EngineGpuHandles) — so the shared
// `stubs.planetRenderer` key is the constructed instance.
vi.mock('../../../../src/services/gpu/renderers/bodies/starRenderer', () => ({
  createStarRenderer: vi.fn(() => makeStub('starRenderer')),
}));
// The shared textured-body renderer keeps its `?static` WESL imports out of
// JSDOM; mock it so the `texturedBodyRenderer` row's construct closure
// lands a stub on `state.gpu.texturedBodyRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/texturedBodyRenderer', () => ({
  createTexturedBodyRenderer: vi.fn(() => makeStub('texturedBodyRenderer')),
}));
// The ring renderer keeps its `?static` WESL imports out of JSDOM; mock it so
// the `ringRenderer` row's construct closure lands a stub on `state.gpu.ringRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/ringRenderer', () => ({
  createRingRenderer: vi.fn(() => makeStub('ringRenderer')),
}));
// Earth's cloud-shell renderer keeps its `?static` WESL imports out of JSDOM;
// mock it so the `cloudShellRenderer` row's construct closure lands a stub on
// `state.gpu.cloudShellRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/cloudShellRenderer', () => ({
  createCloudShellRenderer: vi.fn(() => makeStub('cloudShellRenderer')),
}));
// Earth's atmosphere-shell renderer bakes LUTs against the full device API (compute
// pipelines + storage textures) the plain stub device can't service, and keeps its
// `?static` WESL imports out of JSDOM; mock it so the `atmosphereShellRenderer`
// row's construct closure lands a stub on `state.gpu.atmosphereShellRenderer`.
// That row passes the whole `ATMOSPHERE_PARAMS` record (a real data import —
// no mock needed for it).
vi.mock('../../../../src/services/gpu/renderers/atmosphere/atmosphereShellRenderer', () => ({
  createAtmosphereShellRenderer: vi.fn(() => makeStub('atmosphereShellRenderer')),
}));
// Partial mock: planetsLayer.ts imports the real INSTANCE_FLOATS constant at
// module scope to size its staging buffer (against SCENE_PLANETS.length —
// no fixed cap), so only the factory is stubbed — passing INSTANCE_FLOATS
// through keeps that sizing real.
vi.mock('../../../../src/services/gpu/renderers/bodies/planetRenderer', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../src/services/gpu/renderers/bodies/planetRenderer')
  >()),
  createPlanetRenderer: vi.fn(() => makeStub('planetRenderer')),
}));
vi.mock('../../../../src/services/gpu/renderers/bodies/starPointRenderer', () => ({
  createStarPointRenderer: vi.fn(() => makeStub('starPointRenderer')),
}));
// Partial mock, same rationale as planetRenderer's below: bodyGlintsLayer.ts
// (loaded transitively via the frame program's registry import) reads the real
// MAX_GLINTS / INSTANCE_FLOATS constants at module scope to size its staging
// buffer, so only the factory is stubbed.
vi.mock(
  '../../../../src/services/gpu/renderers/bodies/bodyGlintRenderer',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../src/services/gpu/renderers/bodies/bodyGlintRenderer')
    >()),
    createBodyGlintRenderer: vi.fn(() => makeStub('bodyGlintRenderer')),
  }),
);
// The survey star-catalog renderer's constructor uses the full device API
// (limits + createBuffer + bind groups + pipeline), so a `limits` patch on
// the plain stub device wouldn't survive the next line — mock the factory
// like every other renderer here.
vi.mock('../../../../src/services/gpu/renderers/starCatalog/starCatalogRenderer', () => ({
  createStarCatalogRenderer: vi.fn(() => makeStub('starCatalogRenderer')),
}));
// The pick twin borrows the visual renderer's BGLs + records bind group and
// builds its OWN r32uint pick pipeline against them — a full device pipeline
// dance the plain stub device can't service, so mock the factory like every
// other renderer. `initGpu` calls it with `starCatalogRenderer.pickResources()`.
vi.mock('../../../../src/services/gpu/renderers/starCatalog/starCatalogPickRenderer', () => ({
  createStarCatalogPickRenderer: vi.fn(() => makeStub('starCatalogPickRenderer')),
}));
// The body pick renderer builds two r32uint pick pipelines (a dynamic-offset
// sphere path + an instanced point path) against the full device API the plain
// stub device can't service, so mock the factory like the other pick providers.
vi.mock('../../../../src/services/gpu/renderers/bodies/bodyPickRenderer', () => ({
  createBodyPickRenderer: vi.fn(() => makeStub('bodyPickRenderer')),
}));
// Partial mock, same rationale as planetRenderer's above: orbitTrailsLayer.ts
// (loaded transitively via the frame program's registry import) reads the
// real INSTANCE_FLOATS constant at module scope to size its staging buffer
// (against ORBITAL_ELEMENTS.length — no fixed cap), so only the factory is
// stubbed.
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

// Imported AFTER the mocks so initGpu picks up the mocked dependencies.
import { initGpu } from '../../../../src/services/engine/phases/initGpu';
// The mocked `watchHdrCapability` itself: the HDR-dispatch-wiring tests below
// read `.mock.calls` to recover the callback `initGpu` actually registered,
// so they can invoke it directly rather than trusting the mock's own no-op
// return value.
import { watchHdrCapability } from '../../../../src/services/gpu/device';
import { engineHdrCapabilityChanged } from '../../../../src/state/engine/engineSlice';
// The mocked `loadFontAtlases` itself: overridden to reject in one test below
// to prove `deps.phaseLocals.unwatchHdrCapability` survives a throw that
// happens AFTER the listener is registered but before `initGpu` returns.
import { loadFontAtlases } from '../../../../src/services/gpu/labelLayout/loadFontAtlases';
// The real seeded data bag: the starPointRenderer row's construct closure
// reads `state.data.bodies` (the far-star partition for setStars; the seeded
// planet list drives planetsLayer), so the state fixture carries the real
// construction-time seeds.
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
// The registry itself: derives the expected non-null / null key sets for the
// phase-split assertion below, rather than a hand-written key list that
// could drift from GPU_HANDLE_ROWS.
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';

/**
 * Build a minimal `EngineState` covering the slices `initGpu` reads and
 * writes. Every nullable `gpu.*` handle starts at `null`; the
 * `subsystems` bag carries just the facades `initGpu` calls into
 * (`biasCorrection.attachRenderer`, `labelDirector.attachRenderers`).
 */
function makeState(): EngineState {
  return {
    gpu: {
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
      pickProgram: null,
      milkyWayPickRenderer: null,
      renderTargets: null,
      compositor: null,
      filamentRenderer: null,
      labelRenderer: null,
      foregroundLabelRenderer: null,
      foregroundMarkerLineRenderer: null,
      markerLineRenderer: null,
      selectionRingRenderer: null,
      structureMarkerRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayCloud: null,
      milkyWayCloudRenderer: null,
      horizonShellRenderer: null,
      zoneOfAvoidanceRenderer: null,
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      zoneOfAvoidanceUpsample: null,
      starAggregateUpsample: null,
      pickDebugOverlay: null,
      diskRadiusRing: null,
      earthRenderer: null,
      starRenderer: null,
      planetRenderer: null,
      texturedBodyRenderer: null,
      ringRenderer: null,
      cloudShellRenderer: null,
      atmosphereShellRenderer: null,
      starPointRenderer: null,
      bodyPickRenderer: null,
      bodyGlintRenderer: null,
      orbitTrailRenderer: null,
    },
    // The real seeded stores: planets draw through a single instanced
    // planetRenderer fed by bodies.planets, and initGpu partitions
    // bodies.stars for setStars.
    data: createEngineData(),
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
      foregroundLabelDirector: {
        attachRenderers: vi.fn(),
        registerProducer: vi.fn(),
        runFrame: vi.fn(),
      },
      scheduler: {
        requestRender: vi.fn(),
      },
    },
    settings: {},
    // Both families are minted in wireSlots, not initGpu; declared here (empty,
    // untouched by this phase) only because EngineState requires them.
    assetSlots: {
      points: new Map(),
      bodyTextures: new Map(),
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

    // The mocked `gpuInitGpu` returns `hdrCapable: false` — see the
    // `services/gpu/device` mock factory above.
    expect(deps.cb.store.dispatch).toHaveBeenCalledWith(engineHdrCapabilityChanged(false));
  });

  it("invoking watchHdrCapability's registered callback re-dispatches with the new value", async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Recover the real callback `initGpu` handed to `watchHdrCapability` —
    // the mock's own `() => () => {}` body ignores it, but `.mock.calls`
    // still records what was actually passed.
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

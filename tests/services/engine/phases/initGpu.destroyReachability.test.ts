/**
 * initGpu.destroyReachability — guards that GPU-owning renderers are
 * reachable from the teardown chain.
 *
 * `texturedDiskRenderer`, `proceduralDiskRenderer`, `milkyWayCloud`,
 * `milkyWayCloudRenderer`, and `horizonShellRenderer` each own GPU resources
 * and expose `.destroy()`. They must live on `state.gpu.*` (alongside
 * `renderer`, `pickRenderer`, `renderTargets`, …) so `engine.ts.destroy()`
 * has a reachable reference to each — otherwise every HMR / StrictMode
 * remount leaks their GPU buffers. After `initGpu(state, deps)`, this test
 * checks each renderer field on `state.gpu.*` holds the constructed
 * renderer, not null/undefined.
 *
 * `initGpu` calls `gpuInitGpu(canvas)` (real WebGPU device acquisition),
 * `loadFontAtlases()` (network fetch), and the renderer constructors — none
 * of which work in JSDOM, so each is mocked with a spy-bearing stub whose
 * `destroy` calls can be asserted.
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
    // `initGpu` calls `starPointRenderer.setStars(<the far partition>)`
    // synchronously after constructing the star-point renderer.
    setStars: vi.fn(),
    // `initGpu` calls `starCatalogRenderer.pickResources()` synchronously to
    // hand the pick twin (`starCatalogPickRenderer`) its shared BGLs + the
    // per-source records bind-group lookup. The pick factory is itself mocked
    // here, so this only needs to be a callable returning the resource shape.
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
  // Returns a no-op cleanup — this test asserts renderer reachability, not
  // the HDR-capability listener wiring (see device.hdrCapability.test.ts).
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

vi.mock('../../../../src/services/gpu/renderers/galaxyCatalog/pointRenderer', () => ({
  createPointRenderer: vi.fn(() => makeStub('pointRenderer')),
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

// The earth renderer keeps its `?static` WESL imports out of JSDOM;
// mock it so initGpu's foreground block constructs a stub on
// `state.gpu.earthRenderer` (the un-awaited Blue Marble fetch it fires runs
// after initGpu resolves and fails harmlessly in the test env).
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
// JSDOM; mock it so initGpu's foreground block lands a stub on
// `state.gpu.texturedBodyRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/texturedBodyRenderer', () => ({
  createTexturedBodyRenderer: vi.fn(() => makeStub('texturedBodyRenderer')),
}));
// The ring renderer keeps its `?static` WESL imports out of JSDOM; mock it so
// initGpu's foreground block lands a stub on `state.gpu.ringRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/ringRenderer', () => ({
  createRingRenderer: vi.fn(() => makeStub('ringRenderer')),
}));
// Earth's cloud-shell renderer keeps its `?static` WESL imports out of JSDOM;
// mock it so initGpu's foreground block lands a stub on `state.gpu.cloudShellRenderer`.
vi.mock('../../../../src/services/gpu/renderers/bodies/cloudShellRenderer', () => ({
  createCloudShellRenderer: vi.fn(() => makeStub('cloudShellRenderer')),
}));
// Earth's atmosphere-shell renderer bakes LUTs against the full device API (compute
// pipelines + storage textures) the plain stub device can't service, and keeps its
// `?static` WESL imports out of JSDOM; mock it so initGpu's foreground block lands a
// stub on `state.gpu.atmosphereShellRenderer`. initGpu calls it with
// `ATMOSPHERE_PARAMS['earth']` (a real data row — no mock needed for that import).
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
// The mocked label-renderer factory itself: the main `labelRenderer` and the
// foreground caption renderer are both built through it, so tests index its
// `mock.results` ordinally (call 0 = main, call 1 = foreground) to prove two
// DISTINCT instances land on state.gpu.* — the shared `stubs.labelRenderer`
// key is overwritten by the second call and cannot make that distinction.
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labels/labelRenderer';
// The single planet-renderer factory: asserted constructed exactly once (one
// dynamic-offset renderer draws every seeded planet).
import { createPlanetRenderer } from '../../../../src/services/gpu/renderers/bodies/planetRenderer';
// The real seeded data bag: initGpu reads `state.data.bodies` (the far-star
// partition for setStars; the seeded planet list drives planetsLayer), so the
// state fixture carries the real construction-time seeds.
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

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
      scheduler: {
        requestRender: vi.fn(),
      },
    },
    settings: {},
    assetSlots: {
      points: new Map(),
      // initGpu mints the body-texture family into this keyed map (beside the
      // body renderers) — declared here so the phase can write into it.
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

describe('initGpu — destroy reachability for thumbnail/disk/procedural-disk/milky-way renderers', () => {
  beforeEach(() => {
    // Clear the spy cache so each test sees fresh stubs. The vi.mock
    // factories run per-call, so the map repopulates as initGpu runs.
    for (const k of Object.keys(stubs)) delete stubs[k];
    // Reset the label-factory call history so `mock.results` indices are
    // deterministic within each test (call 0 = main, call 1 = foreground),
    // and the planet-factory history so the "constructed exactly once"
    // assertion holds per test.
    vi.mocked(createLabelRenderer).mockClear();
    vi.mocked(createPlanetRenderer).mockClear();
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

  it('writes the anchor renderers + foregroundLabelRenderer onto state.gpu.*', async () => {
    const state = makeState();
    const deps = makeDeps();
    await initGpu(state, deps);

    // Reachability claim for the textured Earth — it owns the position +
    // uv VBOs, index IBO, uniform buffer, and Earth texture.
    expect(state.gpu.earthRenderer).toBe(stubs.earthRenderer);
    // The body-texture slot family is minted beside the body renderers: one
    // slot per key, including Earth's (the descent texture now rides this
    // family, not a bespoke path).
    expect(state.assetSlots.bodyTextures.has('earth:surface')).toBe(true);
    expect(state.assetSlots.bodyTextures.has('saturn-ring:surface')).toBe(true);
    // The resolved-star renderer (the Sun sphere) must reach state.gpu.* the
    // same way.
    expect(state.gpu.starRenderer).toBe(stubs.starRenderer);
    // A SINGLE planet renderer draws every seeded planet via dynamic-offset
    // slots (see EngineGpuHandles) — constructed exactly once and landed on
    // the singular handle.
    expect(vi.mocked(createPlanetRenderer)).toHaveBeenCalledTimes(1);
    expect(state.gpu.planetRenderer).toBe(stubs.planetRenderer);
    // The shared textured-body renderer owns per-body uniform buffers + surface
    // textures — the destroy chain must reach it the same way.
    expect(state.gpu.texturedBodyRenderer).toBe(stubs.texturedBodyRenderer);
    // The ring renderer owns the disc VBO/IBO + strip texture — the destroy chain
    // must reach it the same way.
    expect(state.gpu.ringRenderer).toBe(stubs.ringRenderer);
    // Earth's cloud shell owns its position + uv VBOs, index IBO, uniform buffer,
    // and cloud texture — the destroy chain must reach it the same way.
    expect(state.gpu.cloudShellRenderer).toBe(stubs.cloudShellRenderer);
    // Earth's atmosphere shell owns three LUT textures + their pipelines, the proxy
    // sphere geometry, the shell pipeline, and three uniform buffers — the destroy
    // chain must reach it the same way.
    expect(state.gpu.atmosphereShellRenderer).toBe(stubs.atmosphereShellRenderer);
    // The star-point renderer receives the FULL star list exactly once, at
    // construction — at the galaxy-scale boot camera every star (the Sun
    // included) is a sub-pixel point, so the whole seed IS the boot
    // partition; the layer's draw stays pure.
    expect(state.gpu.starPointRenderer).toBe(stubs.starPointRenderer);
    // The body-glint renderer (sub-pixel body sprites) needs no data delivery —
    // bodyGlintsLayer packs and hands the batch every frame — so construction
    // alone lands the handle; the destroy chain must reach it to release its
    // instance + uniform buffers.
    expect(state.gpu.bodyGlintRenderer).toBe(stubs.bodyGlintRenderer);
    // The orbit-trail renderer needs no bootstrap data delivery (orbitTrailsLayer
    // derives + packs the conics per frame) — construction alone lands the handle.
    expect(state.gpu.orbitTrailRenderer).toBe(stubs.orbitTrailRenderer);
    // The body pick renderer owns its sphere mesh VBO/IBO + the sphere/point
    // uniform + point instance buffers — the destroy chain must reach it.
    expect(state.gpu.bodyPickRenderer).toBe(stubs.bodyPickRenderer);
    expect(stubs.starPointRenderer!.setStars).toHaveBeenCalledTimes(1);
    const uploaded = stubs.starPointRenderer!.setStars.mock.calls[0]![0] as ReadonlyArray<{
      id: string;
    }>;
    // Compared against the SEEDED list rather than one seed table, so the claim
    // stays "the whole star set" as more tables land in the store.
    const seededIds = state.data.bodies.stars.map((star) => star.id);
    expect(uploaded.map((star) => star.id)).toEqual(seededIds);
    expect(seededIds).toContain('sun');
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
    // Neither label renderer gets a bootstrap `setLabels` call: the executor
    // never runs a layer's `draw` before its `enabled()` gate reads true (see
    // `executeFrame`), so an empty starting buffer is never observed — the
    // director and `foregroundLabelsLayer` both upload their live set on the
    // first real draw instead.
    expect(state.gpu.foregroundLabelRenderer!.setLabels).not.toHaveBeenCalled();
    expect(state.gpu.labelRenderer!.setLabels).not.toHaveBeenCalled();
  });
});

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

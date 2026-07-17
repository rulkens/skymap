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
 *   After `initGpu(state, deps)`, each renderer field on `state.gpu.*`
 *   holds the constructed renderer (not null/undefined) — so the
 *   `engine.ts.destroy()` chain has a reachable reference to release.
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
  setStars: ReturnType<typeof vi.fn>;
};

const stubs: Record<string, Stub> = {};

function makeStub(name: string): Stub {
  const stub: Stub = {
    destroy: vi.fn(),
    // Methods `initGpu` invokes synchronously inside the phase.
    upload: vi.fn().mockResolvedValue(undefined),
    setBiasMode: vi.fn(),
    // `initGpu` calls `foregroundLabelRenderer.setLabels(sceneBodyLabels())`
    // synchronously after constructing the second label renderer.
    setLabels: vi.fn(),
    // `initGpu` calls `starPointRenderer.setStars(<the far partition>)`
    // synchronously after constructing the star-point renderer.
    setStars: vi.fn(),
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

vi.mock('../../../../src/services/gpu/galaxy/milkyWayCloud', () => ({
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

vi.mock('../../../../src/services/gpu/passes/volumeUpsample', () => ({
  createVolumeUpsample: vi.fn(() => makeStub('volumeUpsample')),
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
// Partial mock: planetsLayer.ts imports the real MAX_PLANETS/INSTANCE_FLOATS
// constants at module scope to size its staging buffer, so only the factory
// is stubbed — passing those constants through keeps that sizing real.
vi.mock('../../../../src/services/gpu/renderers/bodies/planetRenderer', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../src/services/gpu/renderers/bodies/planetRenderer')
  >()),
  createPlanetRenderer: vi.fn(() => makeStub('planetRenderer')),
}));
vi.mock('../../../../src/services/gpu/renderers/bodies/starPointRenderer', () => ({
  createStarPointRenderer: vi.fn(() => makeStub('starPointRenderer')),
}));
// The survey star-catalog renderer's constructor uses the full device API
// (limits + createBuffer + bind groups + pipeline), so a `limits` patch on
// the plain stub device wouldn't survive the next line — mock the factory
// like every other renderer here.
vi.mock('../../../../src/services/gpu/renderers/starCatalog/starCatalogRenderer', () => ({
  createStarCatalogRenderer: vi.fn(() => makeStub('starCatalogRenderer')),
}));
// Partial mock, same rationale as planetRenderer's above: orbitTrailsLayer.ts
// (loaded transitively via the frame program's registry import) reads the
// real MAX_ORBITS / INSTANCE_FLOATS constants at module scope to size its
// staging buffer, so only the factory is stubbed.
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
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';

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
      starPointRenderer: null,
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
    expect(state.assetSlots.bodyTextures.has('earth')).toBe(true);
    expect(state.assetSlots.bodyTextures.has('saturn-ring')).toBe(true);
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
    // The star-point renderer receives the FULL star list exactly once, at
    // construction — at the galaxy-scale boot camera every star (the Sun
    // included) is a sub-pixel point, so the whole seed IS the boot
    // partition; the layer's draw stays pure.
    expect(state.gpu.starPointRenderer).toBe(stubs.starPointRenderer);
    // The orbit-trail renderer needs no data delivery (SCENE_ORBIT_CONICS is a
    // static module-level table) — construction alone lands the handle.
    expect(state.gpu.orbitTrailRenderer).toBe(stubs.orbitTrailRenderer);
    expect(stubs.starPointRenderer!.setStars).toHaveBeenCalledTimes(1);
    const uploaded = stubs.starPointRenderer!.setStars.mock.calls[0]![0] as ReadonlyArray<{
      id: string;
    }>;
    expect(uploaded).toHaveLength(SCENE_STARS.length);
    expect(uploaded.map((star) => star.id)).toContain('sun');
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
    // The static scene-body caption set is uploaded once, at construction,
    // onto the foreground renderer only.
    expect(state.gpu.foregroundLabelRenderer!.setLabels).toHaveBeenCalledTimes(1);
    expect(state.gpu.labelRenderer!.setLabels).not.toHaveBeenCalled();
  });
});

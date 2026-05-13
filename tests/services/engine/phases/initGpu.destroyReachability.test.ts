/**
 * initGpu.destroyReachability — regression test for PR #66's follow-up.
 *
 * ### What this protects
 *
 * Four renderers (`texturedQuadRenderer`, `texturedDiskRenderer`,
 * `proceduralDiskRenderer`, `milkyWayRenderer`) each own GPU resources
 * — uniform buffer + per-instance buffer + per-renderer specifics — and
 * each expose a `.destroy()` method.  Pre-2026-05-08 they lived only on
 * the bootstrap-local `phaseLocals` carrier, which `engine.ts.destroy()`
 * had no reference path to: `phaseLocals` is intentionally short-lived
 * (it goes away once `startLoop` finishes), and the frame loop captured
 * the renderers via `RunFrameDeps` closures.  PR #66 flagged this as
 * destroy reachability gap — every HMR / StrictMode remount leaked the
 * four renderers' GPU buffers.
 *
 * The fix promoted the four renderers to `state.gpu.*` (mirroring the
 * existing pattern shared by `renderer`, `pickRenderer`, `postProcess`,
 * `filamentRenderer`, `labelRenderer`, `markerLineRenderer`) so the
 * `destroy()` chain has a reachable reference to each.
 *
 * ### What this test asserts
 *
 *   1. After `initGpu(state, deps)` runs, each of the four renderer
 *      fields on `state.gpu.*` is populated with the constructed
 *      renderer (not null, not undefined).
 *   2. Replaying the `engine.ts.destroy()` chain — the same
 *      `state.gpu.<field>?.destroy()` invocation pattern used by every
 *      other handle in the bag — reaches each renderer's destroy spy.
 *
 * Together those two clauses prove that the destroy-reachability gap
 * is closed by construction: as long as `initGpu` writes the four
 * fields and `engine.ts.destroy()` walks them, the renderers cannot
 * leak across HMR / StrictMode cycles.
 *
 * ### Why mock the heavy modules
 *
 * `initGpu` calls `gpuInitGpu(canvas)` (real WebGPU device acquisition),
 * `loadFontAtlas()` (network fetch), and seven renderer constructors —
 * none of which work in a JSDOM test environment.  We mock the lot so
 * the phase body runs to completion and we can observe the writes it
 * makes to `state.gpu.*`.  Each mock returns a spy-bearing stub whose
 * `destroy` we can assert was called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks ──────────────────────────────────────────────────────
//
// vi.mock is hoisted, so we declare the spies via a factory that runs
// per-mock and stash the produced spy objects in module-scoped maps the
// tests can read.  Each mock returns a stub shaped enough for `initGpu`
// to thread through (constructors return objects with `.destroy`; the
// few methods called during `initGpu` itself like
// `attachRenderer`/`attachRenderers` are present as no-ops).

const stubs: Record<string, { destroy: ReturnType<typeof vi.fn> }> = {};

function makeStub(name: string): { destroy: ReturnType<typeof vi.fn> } {
  const stub = {
    destroy: vi.fn(),
    // Methods called during `initGpu` body itself.  See module under
    // test for the call sites; we only stub what's actually invoked
    // synchronously inside the phase.
    upload: vi.fn().mockResolvedValue(undefined),
    setBiasMode: vi.fn(),
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

vi.mock('../../../../src/services/gpu/renderers/pointRenderer', () => ({
  createPointRenderer: vi.fn(() => makeStub('pointRenderer')),
}));

vi.mock('../../../../src/services/gpu/passes/postProcess', () => ({
  createPostProcess: vi.fn(() => makeStub('postProcess')),
}));

vi.mock('../../../../src/services/gpu/passes/volumeOffscreen', () => ({
  createVolumeOffscreen: vi.fn(() => makeStub('volumeOffscreen')),
}));

vi.mock('../../../../src/services/gpu/renderers/texturedQuadRenderer', () => ({
  createTexturedQuadRenderer: vi.fn(() => makeStub('texturedQuadRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/texturedDiskRenderer', () => ({
  createTexturedDiskRenderer: vi.fn(() => makeStub('texturedDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/proceduralDiskRenderer', () => ({
  createProceduralDiskRenderer: vi.fn(() => makeStub('proceduralDiskRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/milkyWayRenderer', () => ({
  createMilkyWayRenderer: vi.fn(() => makeStub('milkyWayRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/filamentRenderer', () => ({
  createFilamentRenderer: vi.fn(() => makeStub('filamentRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub('labelRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/markerLineRenderer', () => ({
  createMarkerLineRenderer: vi.fn(() => makeStub('markerLineRenderer')),
}));

vi.mock('../../../../src/services/gpu/renderers/scalarVolumeRenderer', () => ({
  createScalarVolumeRenderer: vi.fn(() => makeStub('scalarVolumeRenderer')),
}));

vi.mock('../../../../src/services/gpu/labels/loadFontAtlas', () => ({
  loadFontAtlas: vi.fn(async () => ({
    metrics: { __mockMetrics: true },
    bitmap: { __mockBitmap: true } as unknown as ImageBitmap,
  })),
}));

// `wirePointSourceSlot` mints AssetSlots that the engine never `.load()`s
// in this test, so the production helper is fine — but its module also
// imports several heavy fetcher modules.  Replace with a no-op so the
// initGpu body's per-source loop is harmless.
vi.mock('../../../../src/services/engine/wiring/pointSourceRegistry', () => ({
  POINT_SOURCE_REGISTRY: [] as Array<unknown>,
  wirePointSourceSlot: vi.fn(),
}));

// Imported AFTER the mocks so initGpu picks up the mocked dependencies.
import { initGpu } from '../../../../src/services/engine/phases/initGpu';

/**
 * Build a minimal `EngineState` covering the slices `initGpu` reads
 * and writes.  We populate `gpu.*` with the post-Phase-5 expanded
 * shape (every nullable handle starts at `null`); the `subsystems`
 * bag carries just the two facades `initGpu` calls into
 * (`biasCorrection.attachRenderer`, `labelDirector.attachRenderers`).
 */
function makeState(): EngineState {
  return {
    gpu: {
      renderer: null,
      pickRenderer: null,
      postProcess: null,
      filamentRenderer: null,
      labelRenderer: null,
      markerLineRenderer: null,
      texturedQuadRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      scalarVolumeRenderer: null,
    },
    subsystems: {
      biasCorrection: {
        attachRenderer: vi.fn(),
        setMode: vi.fn().mockResolvedValue(undefined),
      },
      youAreHere: {
        attachRenderers: vi.fn(),
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
    sources: {
      clouds: new Map(),
      visibleMask: 0,
      lodMode: 'auto',
      famousMeta: [],
      famousXrefs: {},
      tier: 'medium',
    },
    assetSlots: {
      points: new Map(),
    },
  } as unknown as EngineState;
}

function makeDeps(state: EngineState): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: {
      onStatusChange: vi.fn(),
      onCloudReady: vi.fn(),
    } as unknown as EngineCallbacks,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    fpsCounter: { sample: () => null } as unknown as BootstrapDeps['fpsCounter'],
    lastReportedFps: { current: null },
    firstReadySourceRef: { current: null },
  };
}

describe('initGpu — destroy reachability for thumbnail/disk/procedural-disk/milky-way renderers', () => {
  beforeEach(() => {
    // Clear the module-scoped spy cache between tests so each test sees
    // a fresh set of stubs.  The vi.mock factories run per-call, so the
    // stubs Map repopulates as initGpu runs.
    for (const k of Object.keys(stubs)) delete stubs[k];
  });

  it('writes texturedQuadRenderer/texturedDiskRenderer/proceduralDiskRenderer/milkyWayRenderer onto state.gpu.*', async () => {
    const state = makeState();
    const deps = makeDeps(state);
    await initGpu(state, deps);

    // All four renderers must reach `state.gpu.*` — that's the
    // reachability claim PR #66's follow-up makes.  Pre-fix these were
    // stashed only on `deps.phaseLocals`.
    expect(state.gpu.texturedQuadRenderer).toBe(stubs.texturedQuadRenderer);
    expect(state.gpu.texturedDiskRenderer).toBe(stubs.texturedDiskRenderer);
    expect(state.gpu.proceduralDiskRenderer).toBe(stubs.proceduralDiskRenderer);
    expect(state.gpu.milkyWayRenderer).toBe(stubs.milkyWayRenderer);
  });

  it('phaseLocals no longer carries the four thumbnail/milky-way renderers — they live solely on state.gpu.*', async () => {
    // M1 of the 2026-05-11 architectural audit collapsed the
    // phaseLocals renderer mirror.  Previously initGpu wrote the four
    // renderers onto BOTH `state.gpu.*` (for destroy reachability) and
    // `deps.phaseLocals` (for later phases to consume).  That mirror
    // was redundant: `state.gpu.*` is set before any later phase reads,
    // so phases now read directly from there with an explicit non-null
    // check that replaces the previous `deps.phaseLocals!.X` folklore
    // bang.  This test pins down that decision so a future
    // "re-add phaseLocals mirror" doesn't silently regress us back to
    // the hidden phase channel.
    const state = makeState();
    const deps = makeDeps(state);
    await initGpu(state, deps);

    expect(deps.phaseLocals).toBeDefined();
    // PhaseLocals is now exactly { device, context } — no renderer fields.
    expect(deps.phaseLocals!).not.toHaveProperty('texturedQuadRenderer');
    expect(deps.phaseLocals!).not.toHaveProperty('texturedDiskRenderer');
    expect(deps.phaseLocals!).not.toHaveProperty('proceduralDiskRenderer');
    expect(deps.phaseLocals!).not.toHaveProperty('milkyWayRenderer');
    // The renderers are still reachable for destroy + consumption via state.gpu.*.
    expect(state.gpu.texturedQuadRenderer).toBe(stubs.texturedQuadRenderer);
    expect(state.gpu.texturedDiskRenderer).toBe(stubs.texturedDiskRenderer);
    expect(state.gpu.proceduralDiskRenderer).toBe(stubs.proceduralDiskRenderer);
    expect(state.gpu.milkyWayRenderer).toBe(stubs.milkyWayRenderer);
  });

  it('replaying engine.ts.destroy() chain on state.gpu.* invokes each renderer.destroy()', async () => {
    const state = makeState();
    const deps = makeDeps(state);
    await initGpu(state, deps);

    // Reach into each handle the same way `engine.ts.destroy()` does —
    // optional-chained `.destroy()` followed by a null-out.  This is
    // the load-bearing assertion: if `initGpu` wrote the renderer to
    // `state.gpu.*` AND `engine.ts.destroy()` walks `state.gpu.*?.destroy()`,
    // then the renderer's destroy spy MUST fire.
    state.gpu.texturedQuadRenderer?.destroy();
    state.gpu.texturedQuadRenderer = null;
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayRenderer?.destroy();
    state.gpu.milkyWayRenderer = null;

    expect(stubs.texturedQuadRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.texturedDiskRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.proceduralDiskRenderer!.destroy).toHaveBeenCalledTimes(1);
    expect(stubs.milkyWayRenderer!.destroy).toHaveBeenCalledTimes(1);

    // Symmetric null-out matches the rest of the bag — see
    // `EngineGpuHandles.d.ts`'s lifecycle docstring.
    expect(state.gpu.texturedQuadRenderer).toBeNull();
    expect(state.gpu.texturedDiskRenderer).toBeNull();
    expect(state.gpu.proceduralDiskRenderer).toBeNull();
    expect(state.gpu.milkyWayRenderer).toBeNull();
  });

  it('destroy is safe when initGpu never ran — every state.gpu.* renderer is null and ?.destroy() no-ops', () => {
    // The destroy() path must tolerate "engine torn down before
    // bootstrap finished" — same contract every other handle in this
    // bag honours.  No initGpu call here; just walk the destroy chain
    // against the zero-state and assert it doesn't throw.
    const state = makeState();
    expect(() => {
      state.gpu.texturedQuadRenderer?.destroy();
      state.gpu.texturedQuadRenderer = null;
      state.gpu.texturedDiskRenderer?.destroy();
      state.gpu.texturedDiskRenderer = null;
      state.gpu.proceduralDiskRenderer?.destroy();
      state.gpu.proceduralDiskRenderer = null;
      state.gpu.milkyWayRenderer?.destroy();
      state.gpu.milkyWayRenderer = null;
    }).not.toThrow();
  });
});

// Suppress unused-var warning — `Source` import keeps `initGpu`'s
// `Source`-typed `firstReadySource` test fixture honest if a future
// test checks the slot wiring.  Today none of the active tests use
// it directly; the import keeps the type-only namespace available.
void Source;

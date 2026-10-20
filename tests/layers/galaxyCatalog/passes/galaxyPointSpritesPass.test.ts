/**
 * galaxyPointSpritesPass — the selection packing, the handed per-catalog value
 * and the SlabView threading, all
 * against stub state + ctx with no GPU device.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { Source } from '../../../../src/data/sources';
import { packSelection } from '../../../../src/data/selectionEncoding';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/layers/galaxyCatalog/state/defaults';
import { galaxyPointSpritesPass } from '../../../../src/layers/galaxyCatalog/passes/galaxyPointSpritesPass';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { COSMO, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { makeGalaxyCatalogItems } from '../../../fixtures/makeGalaxyCatalogItems';
import { makeGalaxyCatalogFade } from '../../../fixtures/makeGalaxyCatalogFade';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

/**
 * `slabs` carries a real cosmological row (built from this ctx's own `vp`) so
 * `slabViewOf(ctx, COSMO)` — the same resolution the production encoders
 * perform once per frame — works against these fixtures without a bespoke
 * double.
 */
function makeCtx(overrides: { drawCamPos?: Readonly<[number, number, number]> } = {}): FrameView {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      simDays: 0,
      focusBlend: 0,
      focus: {
        center: [0, 0, 0] as Readonly<[number, number, number]>,
        apparentRadiusMpc: 1,
        physicalRadiusMpc: 0,
        blend: 0,
      },
      renderTargets: { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    cam,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    // Nothing here reads bodyPose.
    bodyPose: () => null,
    ...overrides,
  } as unknown as FrameView;
}

// The focus group is bound off `state.gpu.focusUniform` — an opaque bind
// group is all the pass reads.
const FULL = makeGalaxyCatalogFade();

const STATE_STUB = {
  gpu: {
    focusUniform: { bindGroup: {} as GPUBindGroup, write: () => {}, destroy: () => {} },
  },
} as unknown as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const SETTINGS_STUB = {
  galaxyCatalogs: {
    items: makeGalaxyCatalogItems(),
    sizePx: 2.5,
    brightness: 1.0,
    provenance: DEFAULT_GALAXY_PROVENANCE,
    depthFade: true,
  },
  bias: {
    mode: BiasMode.None,
    absMagLimit: -19,
  },
} as unknown as EngineState['settings'];

// The pass closes over its Layer's runtime, so the draw spy rides a runtime
// stub while the settings/selection reads stay on the `state` argument.
function makeStateWithRenderer(
  overrides: Partial<EngineState> = {},
  loadedSources: readonly unknown[] = [],
): {
  state: EngineState;
  runtime: GalaxyCatalogRuntime;
  drawSpy: ReturnType<typeof vi.fn>;
  drawPointsSpy: ReturnType<typeof vi.fn>;
} {
  const drawSpy = vi.fn();
  const drawPointsSpy = vi.fn<(...args: unknown[]) => void>();
  const state = {
    ...STATE_STUB,
    selection: { select: null, hover: null, focus: null },
    settings: SETTINGS_STUB,
    ...overrides,
    gpu: { ...STATE_STUB.gpu, ...overrides.gpu },
  } as unknown as EngineState;
  const runtime = {
    pointRenderer: { draw: drawSpy, loadedSources: () => loadedSources },
    pickRenderer: { drawPoints: drawPointsSpy },
  } as unknown as GalaxyCatalogRuntime;
  return { state, runtime, drawSpy, drawPointsSpy };
}

describe('galaxyPointSpritesPass.draw', () => {
  it('packs (source, index) into the selectedPacked u32', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    // Selection is sourced from state.selection.select, not the settings stub.
    const { state, runtime, drawSpy } = makeStateWithRenderer({
      selection: {
        select: { type: 'galaxyCatalog', source: Source.SDSS, index: 42 } as SelectionRef,
        hover: null,
        focus: null,
      } as unknown as EngineState['selection'],
    });
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state, FULL);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Selection lives on arg[3].selectedPacked (the GalaxyPointDrawSettings
    // record).
    const expected = packSelection(Source.SDSS, 42);
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  it('translates null selection to the 0xFFFFFFFF sentinel', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    const { state, runtime, drawSpy } = makeStateWithRenderer();
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state, FULL);
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
  });

  it('hands the per-catalog value to fadeOpacityOf unchanged', () => {
    const { state, runtime, drawSpy } = makeStateWithRenderer();
    const ctx = makeCtx();
    galaxyPointSpritesPass(runtime).draw(
      PASS_STUB,
      slabViewOf(ctx, COSMO),
      ctx,
      state,
      makeGalaxyCatalogFade({ sdss: 0.5, famousGalaxy: 0.25 }),
    );
    const settings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    const fadeOf = settings.fadeOpacityOf as (source: number) => number;
    expect(fadeOf(Source.SDSS)).toBe(0.5);
    expect(fadeOf(Source.FamousGalaxy)).toBe(0.25);
  });

  it('threads view.vp / view.viewportPx / view.camPos to renderer.draw', () => {
    // It must forward the resolved SlabView, not ctx.vp/ctx.canvasSize.
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    const { state, runtime, drawSpy } = makeStateWithRenderer();
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state, FULL);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    const drawSettings = call[3] as Record<string, unknown>;
    expect(drawSettings.camPosWorld).toEqual(view.camPos);
  });
});

describe('galaxyPointSpritesPass.drawPick', () => {
  it('drawPick picks exactly the catalogs whose handed value is above 0', () => {
    // Pick follows the same value the draw does: SDSS is handed 0.5 and Glade 0,
    // whatever the switches say, so the picker gets SDSS and not Glade.
    const loaded = [Source.SDSS, Source.Glade].map((source) => ({
      source,
      vertexBuffer: {} as GPUBuffer,
      count: 1,
      sourceBuffer: {} as GPUBuffer,
    }));
    const { state, runtime, drawPointsSpy } = makeStateWithRenderer({}, loaded);
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);

    galaxyPointSpritesPass(runtime).drawPick!(
      PASS_STUB,
      view,
      ctx,
      state,
      makeGalaxyCatalogFade({ sdss: 0.5, glade: 0 }),
    );
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.SDSS]);
  });
});

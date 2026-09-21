/**
 * galaxyPointSpritesPass — the selection packing, the deep-zoom survey fade
 * (and the famous catalog's exemption from it) and the SlabView threading, all
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
/**
 * `visibleSourceMask` (frame-owned) nests under `snapshot`; every other
 * override (`drawCamPos`) is a view field, spread at the top level.
 */
function makeCtx(
  overrides: { drawCamPos?: Readonly<[number, number, number]>; visibleSourceMask?: number } = {},
): FrameView {
  const { visibleSourceMask, ...viewOverrides } = overrides;
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      simDays: 0,
      focusBlend: 0,
      layersSettling: false,
      visibleSourceMask: visibleSourceMask ?? 0xffffffff,
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
    ...viewOverrides,
  } as unknown as FrameView;
}

// The pass reads `state.subsystems.fades.opacityOf` for per-source fade
// opacity; a stub returning full opacity lets it run without a live
// FadeRegistry. The focus group is bound off `state.gpu.focusUniform` — an
// opaque bind group is all the pass reads.
const STATE_STUB = {
  subsystems: {
    fades: { opacityOf: () => 1, isAnyAnimating: () => false },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
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
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state);
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
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state);
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
  });

  it('multiplies the deep-zoom survey fade into fadeOpacityOf', () => {
    // The whole point cloud recedes on descent into the solar system: the
    // per-source registry opacity (stubbed to 1) is multiplied by the
    // surveyDeepZoom band, keyed on the camera's distance from the
    // heliocentric origin. The default fixture camera sits 5 Mpc out — far
    // outside the band — so the callback must return the registry value
    // unchanged; a camera mid-band must scale it to a strict fraction.
    const far = makeStateWithRenderer();
    const farCtx = makeCtx();
    galaxyPointSpritesPass(far.runtime).draw(
      PASS_STUB,
      slabViewOf(farCtx, COSMO),
      farCtx,
      far.state,
    );
    const farSettings = far.drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    const farFadeOf = farSettings.fadeOpacityOf as (source: number) => number;
    expect(farFadeOf(Source.SDSS)).toBe(1);

    // Mid-band: 0.005 Mpc from origin sits strictly between the band's goneAt
    // (0.002) and fullAt (FOREGROUND_MAX_DISTANCE_MPC ≈ 0.0103), so the fade
    // factor must be a strict fraction — proving the multiply, not just the
    // fully-faded skip below.
    const mid = makeStateWithRenderer();
    const midCtx = makeCtx({
      drawCamPos: [0, 0, 0.005] as Readonly<[number, number, number]>,
    });
    galaxyPointSpritesPass(mid.runtime).draw(
      PASS_STUB,
      slabViewOf(midCtx, COSMO),
      midCtx,
      mid.state,
    );
    const midSettings = mid.drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    const midFadeOf = midSettings.fadeOpacityOf as (source: number) => number;
    const midFade = midFadeOf(Source.SDSS);
    expect(midFade).toBeGreaterThan(0);
    expect(midFade).toBeLessThan(1);
  });

  it('exempts the famous catalog from the survey fade at deep zoom', () => {
    // Inside the band's goneAt edge the survey sources resolve to 0 (the
    // renderer's per-source loop then skips them), but the famous catalog
    // keeps its raw registry opacity — its curated galaxies stay visible
    // inside the Milky Way and near Earth as reference points. The pass
    // still calls renderer.draw: famous may be loaded.
    const { state, runtime, drawSpy } = makeStateWithRenderer();
    const deepCtx = makeCtx({
      drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]>,
    });
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, slabViewOf(deepCtx, COSMO), deepCtx, state);
    const deepSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    const deepFadeOf = deepSettings.fadeOpacityOf as (source: number) => number;
    expect(deepFadeOf(Source.SDSS)).toBe(0);
    // Registry stub returns 1 — famous must pass it through untouched.
    expect(deepFadeOf(Source.FamousGalaxy)).toBe(1);
  });

  it('threads view.vp / view.viewportPx / view.camPos to renderer.draw', () => {
    // It must forward the resolved SlabView, not ctx.vp/ctx.canvasSize.
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    const { state, runtime, drawSpy } = makeStateWithRenderer();
    galaxyPointSpritesPass(runtime).draw(PASS_STUB, view, ctx, state);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    const drawSettings = call[3] as Record<string, unknown>;
    expect(drawSettings.camPosWorld).toEqual(view.camPos);
  });
});

describe('galaxyPointSpritesPass.drawPick', () => {
  it('filters loadedSources by ctx.visibleSourceMask before drawPoints', () => {
    // The pick ctx's `visibleSourceMask` IS the pick mask, so a catalog whose
    // bit is clear (toggled off / fading out) is dropped before the picker
    // draws it.
    // renderer.loadedSources yields SDSS + 2MRS + GLADE; only SDSS + GLADE
    // bits are set in the mask.
    const loaded = [Source.SDSS, Source.TwoMRS, Source.Glade].map((source) => ({
      source,
      vertexBuffer: {} as GPUBuffer,
      count: 1,
      sourceBuffer: {} as GPUBuffer,
    }));
    const ctx = makeCtx({
      visibleSourceMask: (1 << Source.SDSS) | (1 << Source.Glade),
    });
    const view = slabViewOf(ctx, COSMO);
    const { state, runtime, drawPointsSpy } = makeStateWithRenderer({}, loaded);

    galaxyPointSpritesPass(runtime).drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    // arg[1] is the filtered `sources` list handed to drawPoints.
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.SDSS, Source.Glade]);
  });

  it('drops band-faded survey sources from the pick, famous exempt, but still calls drawPoints', () => {
    // Invisible → unpickable: inside the surveyDeepZoom goneAt edge a survey
    // source's band-multiplied opacity is exactly 0, so it must stop claiming
    // hits. Famous rides its exemption (still pickable). drawPoints is called
    // regardless — its @group(0) pick-camera bind is the prefix contract the
    // ring / disk / Milky-Way pick pipelines depend on.
    const loaded = [Source.SDSS, Source.FamousGalaxy].map((source) => ({
      source,
      vertexBuffer: {} as GPUBuffer,
      count: 1,
      sourceBuffer: {} as GPUBuffer,
    }));
    const ctx = makeCtx({
      visibleSourceMask: 0xffffffff,
      drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    const { state, runtime, drawPointsSpy } = makeStateWithRenderer({}, loaded);

    galaxyPointSpritesPass(runtime).drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.FamousGalaxy]);
  });
});

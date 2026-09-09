import { describe, it, expect, vi } from 'vitest';
import { selectionRingLayer } from '../../../../../src/services/engine/frame/passes/selectionRingLayer';
import { near0SelectionRingLayer } from '../../../../../src/services/engine/frame/passes/near0SelectionRingLayer';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { Mat4 } from 'wgpu-matrix';
import { Source } from '../../../../../src/data/sources';
import type { GalaxyRow } from '../../../../../src/@types/engine/GalaxyRow';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import { makeGalaxyRow } from '../../../../fixtures/makeGalaxyRow';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';

// ── fixtures ──────────────────────────────────────────────────────

/**
 * `slabViewOf(ctx, COSMO)` indexes `ctx.slabs[COSMO]` directly (see
 * `slabs.ts`), so every fixture needs a real cosmological row there —
 * mirroring the pattern `passes.test.ts` uses for the HDR layers.
 */
function makeCtx(): ReadyFrameContext {
  const vp = new Float32Array(16) as unknown as Mat4;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp) });
  return {
    isReady: true,
    viewSlot: 0,
    renderedTargets: new Set<string>(),
    // Nothing in this file reads bodyPose.
    bodyPose: () => null,
    cam: {} as never,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    simDays: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    galaxyPointRenderer: {} as never,
    renderTargets: {} as never,
    texturedDisks: {} as never,
  };
}

function makeStateWithSizePx(row: SelectionRow | null, sizePx: number): EngineState {
  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    selectionRows: { select: row, focus: null, hover: null },
    settings: { galaxyCatalogs: { sizePx } },
  } as unknown as EngineState;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// A minimal stand-in for the renderer's stateless `draw`.
function makeRendererSpy() {
  return {
    label: 'selectionRingRenderer',
    draw: vi.fn(),
    destroy: vi.fn(),
  };
}

// A minimal GalaxyRow at a known world position + diameter. The layer reads
// x/y/z and diameterKpc straight from the row via selectionHalo.
function galaxyRow(overrides: Partial<GalaxyRow> = {}): GalaxyRow {
  return makeGalaxyRow({
    source: Source.Glade,
    z: 100, // 100 Mpc away on +z
    diameterKpc: 60, // 60 kpc galaxy
    axisRatio: 1,
    ...overrides,
  });
}

// A structure row — drives the marker pass, never this halo.
function structureRow(): StructureInfo {
  return {
    type: 'structure',
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [10, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
}

// The milkyWay singleton row (bare tag — position resolved from the constant).
const MILKY_WAY_ROW: SelectionRow = { type: 'milkyWay' };

// A scene-body row (planet / famous star / Earth). Like a survey star its halo
// is NEAR0-tagged (radiusMpc 0, floored to a pixel ring), so the COSMO layer
// must ignore it and the NEAR0 sibling must own it.
const BODY_ROW: SelectionRow = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [1e-9, 2e-9, -3e-9],
  radiusM: 69911000,
};

// A survey-star row — its halo is NEAR0-tagged, so the COSMO layer must ignore
// it and the NEAR0 sibling must own it.
const STAR_ROW: SelectionRow = {
  type: 'star',
  index: 7,
  positionMpc: [0.001, -0.002, 0.0005],
  absMag: 4.8,
  bpRp: 0.65,
  radiusM: 696340000,
};

function makeStateWithSelection(row: SelectionRow | null): EngineState {
  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    selectionRows: { select: row, focus: null, hover: null },
  } as unknown as EngineState;
}

// ── enabled() ─────────────────────────────────────────────────────

describe('selectionRingLayer.enabled', () => {
  it('returns false when renderer is null', () => {
    const state = {
      gpu: { selectionRingRenderer: null },
      selectionRows: { select: null, focus: null, hover: null },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });

  it('returns false when nothing is selected', () => {
    const state = makeStateWithSelection(null);
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });

  it('returns true when renderer is non-null and a galaxy row is selected', () => {
    const state = makeStateWithSelection(galaxyRow());
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });

  it('is true when the Milky Way row is selected', () => {
    const state = makeStateWithSelection(MILKY_WAY_ROW);
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });

  it('stays false for a structure row (marker pass owns that halo)', () => {
    const state = makeStateWithSelection(structureRow() as SelectionRow);
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });

  it('stays false for a star row (its NEAR0 halo belongs to the sibling layer)', () => {
    const state = makeStateWithSelection(STAR_ROW);
    const ctx = makeCtx();
    expect(selectionRingLayer.enabled(state, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });
});

// ── slab-exclusivity invariant ────────────────────────────────────
//
// The two ring layers share one `selectionRingRenderer`; a frame records both
// into one encoder with one submit, so if both were ever `enabled()`-true in a
// frame both draws would read the last-written uniforms (the writeBuffer/submit
// race). This guards the real bug directly: for EVERY selection kind at most one
// layer is enabled, and the halo-bearing kinds route to the expected slab's
// layer.
describe('selection-ring slab exclusivity (COSMO vs NEAR0)', () => {
  const ctx = makeCtx();
  const cases: ReadonlyArray<{
    name: string;
    row: SelectionRow | null;
    cosmo: boolean;
    near0: boolean;
  }> = [
    { name: 'nothing selected', row: null, cosmo: false, near0: false },
    { name: 'galaxy', row: galaxyRow(), cosmo: true, near0: false },
    { name: 'milkyWay', row: MILKY_WAY_ROW, cosmo: true, near0: false },
    { name: 'star', row: STAR_ROW, cosmo: false, near0: true },
    { name: 'body', row: BODY_ROW, cosmo: false, near0: true },
    { name: 'structure', row: structureRow() as SelectionRow, cosmo: false, near0: false },
  ];

  for (const { name, row, cosmo, near0 } of cases) {
    it(`${name}: never both layers, routes to the right slab`, () => {
      const state = makeStateWithSelection(row);
      const view = slabViewOf(ctx, COSMO);
      const cosmoEnabled = selectionRingLayer.enabled(state, ctx, view);
      const near0Enabled = near0SelectionRingLayer.enabled(state, ctx, view);
      expect(cosmoEnabled && near0Enabled).toBe(false);
      expect(cosmoEnabled).toBe(cosmo);
      expect(near0Enabled).toBe(near0);
    });
  }
});

// ── draw() ────────────────────────────────────────────────────────

describe('selectionRingLayer.draw', () => {
  it('computes ringRadiusPx from the row and forwards to renderer', () => {
    const state = makeStateWithSizePx(galaxyRow(), 4);
    const ctx = makeCtx();
    selectionRingLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.draw).toHaveBeenCalledOnce();
    // The selection is `draw`'s 4th argument.
    const arg = rendererSpy.draw.mock.calls[0]![3]!;
    // worldPos copied straight from the row's x/y/z
    expect(arg.worldPos[0]).toBeCloseTo(0);
    expect(arg.worldPos[1]).toBeCloseTo(0);
    expect(arg.worldPos[2]).toBeCloseTo(100);
    // ringRadiusPx = max(pointSizePx, apparentPxRadius * 0.5) * RING_SIZE_SCALE (6)
    // apparentPxRadius = (60 * 2 / 1000 / 100) * 720 = 0.864
    // apparentPxRadius * 0.5 = 0.432; pointSizePx (4) wins; * 6 = 24
    expect(arg.ringRadiusPx).toBeCloseTo(24, 5);
  });

  it('uses apparentPxRadius when galaxy is closer and larger on screen', () => {
    // Galaxy at 10 Mpc so the apparent radius dominates.
    const state = makeStateWithSizePx(galaxyRow({ z: 10 }), 4);
    const ctx = makeCtx();

    selectionRingLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    const arg = rendererSpy.draw.mock.calls[0]![3]!;
    // apparentPxRadius = (60 * 2 / 1000 / 10) * 720 = 8.64
    // apparentPxRadius * 0.5 = 4.32; > pointSizePx (4); * 6 = 25.92
    expect(arg.ringRadiusPx).toBeCloseTo(25.92, 4);
  });

  it('draws the ring at MILKY_WAY_CENTER_WORLD for a milkyWay row', () => {
    const state = makeStateWithSizePx(MILKY_WAY_ROW, 4);
    const ctx = makeCtx();
    selectionRingLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.draw).toHaveBeenCalledOnce();
    const arg = rendererSpy.draw.mock.calls[0]![3]!;
    expect(arg.worldPos[0]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0]);
    expect(arg.worldPos[1]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1]);
    expect(arg.worldPos[2]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2]);
    expect(Number.isFinite(arg.ringRadiusPx)).toBe(true);
    expect(arg.ringRadiusPx).toBeGreaterThan(0);
  });

  it('calls renderer.draw() exactly once with viewProj + viewport', () => {
    const state = makeStateWithSizePx(galaxyRow(), 4);
    const ctx = makeCtx();
    selectionRingLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.draw).toHaveBeenCalledOnce();
    // The viewport is `draw`'s 3rd argument.
    expect(rendererSpy.draw.mock.calls[0]![2]).toEqual([1280, 720]);
  });

  // Cross-file contract (Task 12): the occlusion joint now reads
  // 'foreground:0's COLOUR view (its alpha, via lib/sceneDepth.wesl), not its
  // depth view — each painter-chain row clears its own depth (spec §7.3), so
  // the depth buffer can no longer back a coverage test. This fails if the
  // layer is ever pointed back at `depthViewOf`.
  it('passes the foreground colour view (not the depth view) to the renderer as the 5th arg', () => {
    const state = makeStateWithSizePx(galaxyRow(), 4);
    const sentinelColorView = {} as GPUTextureView;
    const viewOf = vi.fn<(id: string) => GPUTextureView>(() => sentinelColorView);
    const depthViewOf = vi.fn<(id: string) => GPUTextureView>(() => ({}) as GPUTextureView);
    const ctx = {
      ...makeCtx(),
      renderedTargets: new Set(['foreground:0']),
      renderTargets: { viewOf, depthViewOf } as unknown as ReadyFrameContext['renderTargets'],
    };

    selectionRingLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, state);

    expect(viewOf).toHaveBeenCalledWith('foreground:0');
    expect(depthViewOf).not.toHaveBeenCalled();
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.draw.mock.calls[0]![4]).toBe(sentinelColorView);
  });
});

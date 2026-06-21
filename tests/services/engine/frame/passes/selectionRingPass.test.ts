import { describe, it, expect, vi } from 'vitest';
import { selectionRingPass } from '../../../../../src/services/engine/frame/passes/selectionRingPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';
import { Source } from '../../../../../src/data/sources';
import type { GalaxyRow } from '../../../../../src/@types/engine/GalaxyRow';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';

// ── fixtures ──────────────────────────────────────────────────────

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: { center: [0, 0, 0] as Readonly<[number, number, number]>, apparentRadiusMpc: 1, physicalRadiusMpc: 0, blend: 0 },
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
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

const DEPS_STUB = {} as PassDeps;

// A minimal stand-in for the renderer's stateless `draw`.
function makeRendererSpy() {
  return {
    label: 'selectionRingRenderer',
    draw: vi.fn(),
    destroy: vi.fn(),
  };
}

// A minimal GalaxyRow at a known world position + diameter. The pass reads
// x/y/z and diameterKpc straight from the row via selectionHalo.
function galaxyRow(overrides: Partial<GalaxyRow> = {}): GalaxyRow {
  return {
    type: 'galaxyCatalog',
    source: Source.Glade,
    index: 0,
    objId: '1',
    x: 0,
    y: 0,
    z: 100, // 100 Mpc away on +z
    redshift: 0,
    magU: 0,
    magG: 0,
    magR: 0,
    magI: 0,
    magZ: 0,
    diameterKpc: 60, // 60 kpc galaxy
    axisRatio: 1,
    positionAngleDeg: 0,
    classByte: 0,
    parentSurveyByte: 0,
    ...overrides,
  };
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

function makeStateWithSelection(row: SelectionRow | null): EngineState {
  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    selectionRows: { select: row, focus: null, hover: null },
  } as unknown as EngineState;
}

// ── enabled() ─────────────────────────────────────────────────────

describe('selectionRingPass.enabled', () => {
  it('returns false when renderer is null', () => {
    const state = {
      gpu: { selectionRingRenderer: null },
      selectionRows: { select: null, focus: null, hover: null },
    } as unknown as EngineState;
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns false when nothing is selected', () => {
    const state = makeStateWithSelection(null);
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(false);
  });

  it('returns true when renderer is non-null and a galaxy row is selected', () => {
    const state = makeStateWithSelection(galaxyRow());
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(true);
  });

  it('is true when the Milky Way row is selected', () => {
    const state = makeStateWithSelection(MILKY_WAY_ROW);
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(true);
  });

  it('stays false for a structure row (marker pass owns that halo)', () => {
    const state = makeStateWithSelection(structureRow() as SelectionRow);
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(false);
  });

  it('stays true for a galaxy row (regression)', () => {
    const state = makeStateWithSelection(galaxyRow());
    expect(selectionRingPass.enabled(state, makeCtx())).toBe(true);
  });
});

// ── draw() ────────────────────────────────────────────────────────

describe('selectionRingPass.draw', () => {
  it('computes ringRadiusPx from the row and forwards to renderer', () => {
    const state = makeStateWithSizePx(galaxyRow(), 4);
    selectionRingPass.draw(
      PASS_STUB,
      makeCtx(),
      state,
      DEPS_STUB,
    );

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

    selectionRingPass.draw(
      PASS_STUB,
      makeCtx(),
      state,
      DEPS_STUB,
    );
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
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, DEPS_STUB);

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
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.draw).toHaveBeenCalledOnce();
    // The viewport is `draw`'s 3rd argument.
    expect(rendererSpy.draw.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});

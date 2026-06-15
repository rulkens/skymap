import { describe, it, expect, vi } from 'vitest';
import { selectionRingPass } from '../../../../../src/services/engine/frame/passes/selectionRingPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';
import { Source } from '../../../../../src/data/sources';
import type { FocusableTarget } from '../../../../../src/@types/engine/FocusableTarget';
import type { GalaxyInfo } from '../../../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import { MILKY_WAY_INFO } from '../../../../../src/data/milkyWay/milkyWayInfo';
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
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
    texturedDisks: {} as never,
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return { pointSizePx: 4, ...overrides } as RenderFrameSettings;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const DEPS_STUB = {} as PassDeps;

// A minimal stand-in for the renderer's `setSelection` + `render`.
function makeRendererSpy() {
  return {
    label: 'selectionRingRenderer',
    setSelection: vi.fn(),
    hasSelection: vi.fn().mockReturnValue(false),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}

// A resolved galaxy target at a known world position + diameter. The pass
// reads these straight off the target (no catalog re-index).
function galaxyTarget(overrides: Partial<GalaxyInfo> = {}): GalaxyInfo {
  return {
    type: 'galaxyCatalog',
    source: Source.Glade,
    index: 0,
    x: 0,
    y: 0,
    z: 100, // 100 Mpc away on +z
    diameterKpc: 60, // 60 kpc galaxy
    ...overrides,
  } as unknown as GalaxyInfo;
}

// A resolved structure target — drives the marker pass, never this halo.
function structureTarget(): StructureInfo {
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

function makeStateWithSelection(selection: FocusableTarget | null): EngineState {
  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    subsystems: {
      selection: {
        selected: () => selection,
      },
    },
    debug: { disabledPasses: new Set() },
  } as unknown as EngineState;
}

// ── enabled() ─────────────────────────────────────────────────────

describe('selectionRingPass.enabled', () => {
  it('returns false when renderer is null', () => {
    const state = {
      gpu: { selectionRingRenderer: null },
      subsystems: { selection: { selected: () => null } },
    } as unknown as EngineState;
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns false when nothing is selected', () => {
    const state = makeStateWithSelection(null);
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns true when renderer is non-null and a galaxy is selected', () => {
    const state = makeStateWithSelection(galaxyTarget());
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('is true when the Milky Way is selected', () => {
    const state = makeStateWithSelection(MILKY_WAY_INFO);
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('stays false for a structure selection (marker pass owns that halo)', () => {
    const state = makeStateWithSelection(structureTarget());
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('stays true for a galaxy selection (regression)', () => {
    const state = makeStateWithSelection(galaxyTarget());
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });
});

// ── draw() ────────────────────────────────────────────────────────

describe('selectionRingPass.draw', () => {
  it('computes ringRadiusPx from the target and forwards to renderer', () => {
    const state = makeStateWithSelection(galaxyTarget());
    selectionRingPass.draw(
      PASS_STUB,
      makeCtx(),
      state,
      makeSettings({ pointSizePx: 4 }),
      DEPS_STUB,
    );

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.setSelection).toHaveBeenCalledOnce();
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // worldPos copied straight from the target's x/y/z
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
    const state = makeStateWithSelection(galaxyTarget({ z: 10 }));

    selectionRingPass.draw(
      PASS_STUB,
      makeCtx(),
      state,
      makeSettings({ pointSizePx: 4 }),
      DEPS_STUB,
    );
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // apparentPxRadius = (60 * 2 / 1000 / 10) * 720 = 8.64
    // apparentPxRadius * 0.5 = 4.32; > pointSizePx (4); * 6 = 25.92
    expect(arg.ringRadiusPx).toBeCloseTo(25.92, 4);
  });

  it('draws the ring at MILKY_WAY_CENTER_WORLD for a milkyWay selection', () => {
    const state = makeStateWithSelection(MILKY_WAY_INFO);
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings(), DEPS_STUB);

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.setSelection).toHaveBeenCalledOnce();
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    expect(arg.worldPos[0]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0]);
    expect(arg.worldPos[1]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1]);
    expect(arg.worldPos[2]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2]);
    expect(Number.isFinite(arg.ringRadiusPx)).toBe(true);
    expect(arg.ringRadiusPx).toBeGreaterThan(0);
  });

  it('calls renderer.render() exactly once with viewProj + viewport', () => {
    const state = makeStateWithSelection(galaxyTarget());
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings(), DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    expect(rendererSpy.render).toHaveBeenCalledOnce();
    expect(rendererSpy.render.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});

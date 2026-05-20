import { describe, it, expect, vi } from 'vitest';
import { selectionRingPass } from '../../../../../src/services/engine/frame/passes/selectionRingPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';
import { Source } from '../../../../../src/data/sources';

// ── fixtures ──────────────────────────────────────────────────────

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
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

// A catalog stub with one galaxy at known world position + diameter.
// Position is the flat Float32Array `positions[localIdx*3 .. +3]`.
function makeStateWithSelection(selection: { source: Source; localIdx: number } | null): EngineState {
  const positions = new Float32Array([0, 0, 100]); // 100 Mpc away on +z
  const diameterKpc = new Float32Array([60]);       // 60 kpc galaxy
  const catalog = { positions, diameterKpc } as unknown as Parameters<EngineState['sources']['catalogs']['set']>[1];
  const catalogs = new Map();
  catalogs.set(Source.Glade, catalog);

  return {
    gpu: { selectionRingRenderer: makeRendererSpy() },
    sources: { catalogs },
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

  it('returns true when renderer is non-null and a selection exists', () => {
    const state = makeStateWithSelection({ source: Source.Glade, localIdx: 0 });
    expect(selectionRingPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });
});

// ── draw() ────────────────────────────────────────────────────────

describe('selectionRingPass.draw', () => {
  it('computes ringRadiusPx from catalog data and forwards to renderer', () => {
    const state = makeStateWithSelection({ source: Source.Glade, localIdx: 0 });
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings({ pointSizePx: 4 }), DEPS_STUB);

    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    expect(rendererSpy.setSelection).toHaveBeenCalledOnce();
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // worldPos copied straight from catalog.positions[0..3]
    expect(arg.worldPos[0]).toBeCloseTo(0);
    expect(arg.worldPos[1]).toBeCloseTo(0);
    expect(arg.worldPos[2]).toBeCloseTo(100);
    // ringRadiusPx = max(pointSizePx, apparentPxRadius * 0.5) * 8
    // apparentPxRadius = (60 * 2 / 1000 / 100) * 720 = 0.864
    // apparentPxRadius * 0.5 = 0.432; pointSizePx (4) wins; * 8 = 32
    expect(arg.ringRadiusPx).toBeCloseTo(32, 5);
  });

  it('uses apparentPxRadius when galaxy is closer and larger on screen', () => {
    const state = makeStateWithSelection({ source: Source.Glade, localIdx: 0 });
    // Override the catalog position to put galaxy at 10 Mpc so the
    // apparent radius dominates.
    const cat = state.sources.catalogs.get(Source.Glade)!;
    (cat as unknown as { positions: Float32Array }).positions = new Float32Array([0, 0, 10]);

    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings({ pointSizePx: 4 }), DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const arg = rendererSpy.setSelection.mock.calls[0]![0]!;
    // apparentPxRadius = (60 * 2 / 1000 / 10) * 720 = 8.64
    // apparentPxRadius * 0.5 = 4.32; > pointSizePx (4); * 8 = 34.56
    expect(arg.ringRadiusPx).toBeCloseTo(34.56, 4);
  });

  it('calls renderer.render() exactly once with viewProj + viewport', () => {
    const state = makeStateWithSelection({ source: Source.Glade, localIdx: 0 });
    selectionRingPass.draw(PASS_STUB, makeCtx(), state, makeSettings(), DEPS_STUB);
    const rendererSpy = state.gpu.selectionRingRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    expect(rendererSpy.render).toHaveBeenCalledOnce();
    expect(rendererSpy.render.mock.calls[0]![2]).toEqual([1280, 720]);
  });
});

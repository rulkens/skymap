/**
 * passes — unit tests for the per-pass `enabled` gates and the
 * `HDR_PASSES` registry order.
 *
 * Test surface:
 *   - Each pass's `enabled(state, ctx, settings)` predicate flips
 *     correctly for its gate, with stub state + ctx + settings (no GPU
 *     device).
 *   - `HDR_PASSES` holds the passes in canonical order.
 *   - A few `draw` calls verified end-to-end with stub renderers,
 *     confirming which renderer method fires and with which args.
 *
 * Encoder command sequencing and the post-process tone-map running
 * outside the HDR pass are covered by `renderFrame.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';

import { Source } from '../../../../../src/data/sources';
import { BiasMode } from '../../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../../src/data/toneMapCurve';
import {
  HDR_PASSES,
  TIMED_SLOT_NAMES,
  pointSpritesPass,
  proceduralDisksPass,
  filamentsPass,
  milkyWayPass,
  horizonShellPass,
} from '../../../../../src/services/engine/frame/passes';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';

// ── Stub builders ───────────────────────────────────────────────────────────

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
 * Build a ReadyFrameContext with stub GPU/subsystem handles. The tests
 * only inspect a subset (camera position, vp, canvas size, plus the
 * renderer mock for `draw`); the rest satisfy the type.
 */
function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as mat4;
  const renderer = { draw: vi.fn() } as any;
  const postProcess = {
    view: {} as GPUTextureView,
    draw: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  } as any;
  const volumeOffscreen = { view: {} as GPUTextureView, resize: vi.fn(), destroy: vi.fn() } as any;
  const texturedDisks = {
    runFrame: vi.fn(),
    lastOutput: { quads: [], disks: [] },
    hasInFlightWork: () => false,
  } as any;
  return {
    isReady: true,
    cam,
    vp,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    renderer,
    postProcess,
    volumeOffscreen,
    texturedDisks,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null,
    visibleSourceMask: 0xffffffff,
    highlightFallback: true,
    realOnlyMode: false,
    biasMode: BiasMode.None,
    absMagLimit: -19,
    apparentMagLimit: 19.5,
    schechterMStar: -20.83,
    schechterAlpha: -1.2,
    depthFadeEnabled: true,
    pxFadeStartPoints: 8,
    pxFadeEndPoints: 14,
    focus: { center: [0, 0, 0], radiusMpc: 0, blend: 0 },
    exposure: 1.0,
    toneMapCurve: ToneMapCurve.Reinhard,
    galaxyTexturesEnabled: true,
    milkyWayEnabled: true,
    filamentsEnabled: false,
    filamentIntensity: 1,
    volumesEnabled: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PassDeps> = {}): PassDeps {
  return {
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    horizonShellRenderer: { draw: vi.fn() } as any,
    catalogs: new Map(),
    famousMeta: [],
    milkyWayITimeSec: 0,
    ...overrides,
  };
}

// `state` is forwarded through — most passes ignore it, but
// `pointSpritesPass` reads `state.subsystems.fades.opacityOf` for
// per-source fade opacity. A minimal fades stub returning full opacity
// lets the pass run without a live FadeRegistry.
const STATE_STUB = {
  subsystems: {
    fades: {
      opacityOf: () => 1,
      isAnyAnimating: () => false,
    },
  },
  // pointSpritesPass / disk passes bind the shared focus group off
  // state.gpu.focusUniform; an opaque bind group is all they read.
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HDR_PASSES registry', () => {
  it('contains the eight HDR passes in canonical draw order', () => {
    // Order is load-bearing for HMR-stability of the encoder record;
    // see passes/index.ts module header. Marker-lines and labels live
    // in UI_PASSES (post-tone-map overlay), not HDR_PASSES, so they
    // escape tone-map curve compression and dodge the OVER-blend
    // coherency issue on tile-based GPUs. The horizon shell draws after
    // the volume upsample (so cosmic-web densities composite over it)
    // and before cluster-markers (so marker rings pop on top).
    expect(HDR_PASSES).toHaveLength(8);
    expect(HDR_PASSES.map((p) => p.name)).toEqual([
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'milky-way',
      'filaments',
      'volume-upsample',
      'horizon-shell',
      'cluster-markers',
    ]);
  });
});

describe('TIMED_SLOT_NAMES registry', () => {
  it('auto-includes every HDR pass name, bracketed by the framework slots', () => {
    // Auto-registration guarantee: a renderer that joins HDR_PASSES
    // acquires a GPU-timing slot + a DebugPanel row with no timing-layer
    // edit, because both derive from this list.
    expect(TIMED_SLOT_NAMES).toEqual([
      'scalar-volume',
      ...HDR_PASSES.map((p) => p.name),
      'tone-map',
      'ui-overlay',
      'pick',
    ]);
    // cluster-markers is present purely by virtue of being in HDR_PASSES.
    expect(TIMED_SLOT_NAMES).toContain('cluster-markers');
  });

  it('has unique slot names (no index-pair collisions downstream)', () => {
    expect(new Set(TIMED_SLOT_NAMES).size).toBe(TIMED_SLOT_NAMES.length);
  });
});

describe('pointSpritesPass.enabled', () => {
  it('always returns true (no user-facing toggle for point-sprites)', () => {
    expect(pointSpritesPass.enabled(STATE_STUB, makeCtx(), makeSettings())).toBe(true);
    // Even when every other toggle is off, point-sprites still runs.
    const off = makeSettings({
      galaxyTexturesEnabled: false,
      milkyWayEnabled: false,
      filamentsEnabled: false,
    });
    expect(pointSpritesPass.enabled(STATE_STUB, makeCtx(), off)).toBe(true);
  });
});

describe('proceduralDisksPass.enabled', () => {
  it('returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: {
        proceduralDisks: { lastOutput: { instances: [{}] } },
      },
    } as unknown as EngineState;
    expect(
      proceduralDisksPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: false })),
    ).toBe(false);
  });

  it('returns false when subsystem is null', () => {
    const state = { subsystems: { proceduralDisks: null } } as unknown as EngineState;
    expect(
      proceduralDisksPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: true })),
    ).toBe(false);
  });

  it('returns false when no instances are pending', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [] } } },
    } as unknown as EngineState;
    expect(
      proceduralDisksPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: true })),
    ).toBe(false);
  });

  it('returns true when enabled, subsystem present, and instances pending', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
    } as unknown as EngineState;
    expect(
      proceduralDisksPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: true })),
    ).toBe(true);
  });
});

// Coverage for the `textured-disks` pass lives in
// `texturedDisksPass.test.ts` (one test file per Pass module, matching
// the convention used by every other entry in `passes/`).  The
// HDR_PASSES registry check above pins the name in canonical order.

describe('filamentsPass.enabled', () => {
  it('returns true when filamentsEnabled is true (renderer presence checked in draw)', () => {
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: true })),
    ).toBe(true);
  });

  it('returns false when filamentsEnabled is false AND fade opacity is 0', () => {
    // STATE_STUB.fades.opacityOf returns 1 by default — override to 0
    // so the gate doesn't keep the pass alive through a fade-out tail.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
    } as unknown as EngineState;
    expect(
      filamentsPass.enabled(stateZeroFade, makeCtx(), makeSettings({ filamentsEnabled: false })),
    ).toBe(false);
  });

  it('returns true when filamentsEnabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // STATE_STUB's opacityOf = 1 simulates a fade-out in progress; the
    // gate keeps the pass alive so the user sees the smooth ~100 ms ramp
    // instead of an instant pop.
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: false })),
    ).toBe(true);
  });
});

describe('filamentsPass.draw', () => {
  it('skips drawing when filamentRenderer is null even if enabled', () => {
    // The renderer-null guard lives in `draw` because `enabled` doesn't
    // receive `deps`. With a null renderer there's nothing to spy on —
    // just assert no exception escapes.
    const deps = makeDeps({ filamentRenderer: null });
    expect(() =>
      filamentsPass.draw(
        PASS_STUB,
        makeCtx(),
        STATE_STUB,
        makeSettings({ filamentsEnabled: true }),
        deps,
      ),
    ).not.toThrow();
  });

  it('forwards correct args to filamentRenderer.draw when present', () => {
    const drawSpy = vi.fn();
    const deps = makeDeps({ filamentRenderer: { draw: drawSpy } as any });
    const ctx = makeCtx();
    const settings = makeSettings({ filamentsEnabled: true, filamentIntensity: 0.7 });
    filamentsPass.draw(PASS_STUB, ctx, STATE_STUB, settings, deps);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.vp);
    expect(args[2]).toEqual([ctx.canvasSize.width, ctx.canvasSize.height]);
    expect(args[3]).toBe(1.5); // line halfwidth (FILAMENT_LINE_HALFWIDTH_PX)
    expect(args[4]).toBe(0.7);
  });
});

describe('milkyWayPass.enabled', () => {
  it('returns true when milkyWayEnabled is true and camera is inside the fade band', () => {
    // Default makeCtx() puts the camera at 5 Mpc, inside the full-alpha
    // (≤10 Mpc) regime. Both gates pass.
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: true })),
    ).toBe(true);
  });

  it('returns false when milkyWayEnabled is false AND fade opacity is 0', () => {
    // STATE_STUB's fades.opacityOf returns 1 by default — override to 0
    // so the gate doesn't keep the pass alive through a fade-out tail.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
    } as unknown as EngineState;
    expect(
      milkyWayPass.enabled(stateZeroFade, makeCtx(), makeSettings({ milkyWayEnabled: false })),
    ).toBe(false);
  });

  it('returns true when milkyWayEnabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // opacityOf = 1 simulates a toggle fade-out still in flight, and the
    // distance-based fadeAlpha also passes (camera near origin), so the
    // gate's second condition is non-zero — the pass renders.
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: false })),
    ).toBe(true);
  });

  it('returns false when camera is beyond the fade band (no empty render pass)', () => {
    // 1000 Mpc — well past FADE_OUTER_MPC (50 Mpc). Gating in `enabled`
    // (not just `draw`) skips the empty beginRenderPass +
    // timestamp-write on the split-encoder path.
    const ctx = makeCtx({
      drawCamPos: [1000, 0, 0] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(STATE_STUB, ctx, makeSettings({ milkyWayEnabled: true }))).toBe(
      false,
    );
  });
});

describe('milkyWayPass.draw', () => {
  it('calls milkyWayRenderer.draw when camera is inside the fade band', () => {
    // Camera at 5 Mpc from origin sits inside the full-alpha (≤10 Mpc)
    // regime — fadeAlpha should be 1.0.
    const drawSpy = vi.fn();
    const deps = makeDeps({ milkyWayRenderer: { draw: drawSpy } as any, milkyWayITimeSec: 1.5 });
    const ctx = makeCtx();
    milkyWayPass.draw(PASS_STUB, ctx, STATE_STUB, makeSettings(), deps);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.vp);
    expect(args[2]).toEqual([ctx.canvasSize.width, ctx.canvasSize.height]);
    // fadeAlpha at distance 5 Mpc is 1.0 (full strength).
    expect(args[3]).toBe(1.0);
    expect(args[4]).toBe(1.5);
    expect(args[5]).toEqual([0, 0, 5]);
  });
});

describe('horizonShellPass.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the pass is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    expect(horizonShellPass.enabled(STATE_STUB, makeCtx(), makeSettings())).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(horizonShellPass.enabled(STATE_STUB, ctx, makeSettings())).toBe(true);
  });
});

describe('horizonShellPass.draw', () => {
  it('forwards the distance-fade alpha as the 4th draw arg', () => {
    const drawSpy = vi.fn();
    const deps = makeDeps({ horizonShellRenderer: { draw: drawSpy } as any });
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    horizonShellPass.draw(PASS_STUB, ctx, STATE_STUB, makeSettings(), deps);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    expect(args[2]).toEqual([ctx.canvasSize.width, ctx.canvasSize.height]);
    // 8 Gpc is past the full-strength point → alpha 1.0.
    expect(args[3]).toBe(1.0);
  });
});

describe('pointSpritesPass.draw', () => {
  it('packs (source, localIdx) into the selectedPacked u32', () => {
    const ctx = makeCtx();
    const settings = makeSettings({
      selected: { kind: 'galaxy', source: Source.SDSS, localIdx: 42 },
    });
    const deps = makeDeps();
    pointSpritesPass.draw(PASS_STUB, ctx, STATE_STUB, settings, deps);
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Selection lives on arg[3].selectedPacked (the PointDrawSettings
    // record).
    const expected = ((Source.SDSS << 27) | 42) >>> 0;
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  it('translates null selection to the 0xFFFFFFFF sentinel', () => {
    const ctx = makeCtx();
    pointSpritesPass.draw(PASS_STUB, ctx, STATE_STUB, makeSettings({ selected: null }), makeDeps());
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
  });
});

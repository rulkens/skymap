/**
 * passes — unit tests for the per-pass `enabled` gates and the
 * `HDR_PASSES` registry order.
 *
 * Test surface:
 *   - Each pass's `enabled(state, ctx, settings)` predicate flips
 *     correctly for the relevant gate.  Tested with stub state +
 *     ctx + settings — no GPU device needed.
 *   - The `HDR_PASSES` array contains the four passes in canonical
 *     order: point-sprites → galaxy-thumbnails → filaments →
 *     milky-way.
 *   - Two `draw` calls verified end-to-end with stub renderers,
 *     confirming the call shape (which underlying renderer method
 *     fires, with which args).
 *
 * Rendering correctness — that the encoder records the right
 * sequence of GPU commands, and that the post-process tone-map runs
 * outside the HDR pass — is covered by `renderFrame.test.ts`.  We
 * deliberately don't duplicate that coverage here.
 */

import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';

import { Source } from '../../../../../src/data/sources';
import { BiasMode } from '../../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../../src/data/toneMapCurve';
import {
  HDR_PASSES,
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  filamentsPass,
  milkyWayPass,
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
 * Build a ReadyFrameContext shape with stub GPU/subsystem handles.
 * The pass tests only inspect a subset (camera position, vp, canvas
 * size, plus the renderer mock when asserting `draw` shape) — every
 * other field is filled in to satisfy the type.
 */
function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as mat4;
  const renderer = { draw: vi.fn() } as any;
  const postProcess = { view: {} as GPUTextureView, draw: vi.fn(), resize: vi.fn(), destroy: vi.fn() } as any;
  const volumeOffscreen = { view: {} as GPUTextureView, resize: vi.fn(), destroy: vi.fn() } as any;
  const texturedImpostors = { runFrame: vi.fn(), lastOutput: { quads: [], disks: [] }, hasInFlightWork: () => false } as any;
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
    texturedImpostors,
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
    texturedQuadRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    catalogs: new Map(),
    famousMeta: [],
    famousXrefs: {} as any,
    milkyWayITimeSec: 0,
    ...overrides,
  };
}

// `state` is forwarded through — most passes don't read it, but
// `pointSpritesPass` reads `state.subsystems.fades.opacityOf` to resolve
// per-source fade opacity for the current frame.  Provide a minimal fades
// stub that always returns full opacity (1.0) so the pass can run without
// a live FadeRegistry.
const STATE_STUB = {
  subsystems: {
    fades: {
      opacityOf: () => 1,
      isAnyAnimating: () => false,
    },
  },
} as unknown as EngineState;

const PASS_STUB = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn() } as unknown as GPURenderPassEncoder;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HDR_PASSES registry', () => {
  it('contains the six HDR passes in canonical draw order', () => {
    // Order is load-bearing for HMR-stability of the encoder record;
    // see passes/index.ts module header.  Marker-lines and labels
    // moved out of HDR_PASSES to UI_PASSES (post-tone-map overlay) so
    // they could escape the tone-map curve compression and avoid the
    // OVER-blend coherency issue on tile-based GPUs.
    expect(HDR_PASSES).toHaveLength(6);
    expect(HDR_PASSES.map((p) => p.name)).toEqual([
      'point-sprites',
      'procedural-disks',
      'textured-impostors',
      'milky-way',
      'filaments',
      'volume-upsample',
    ]);
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

describe('texturedImpostorsPass.enabled', () => {
  it('returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: {
        texturedImpostors: { lastOutput: { disks: [{}], quads: [] } },
      },
    } as unknown as EngineState;
    expect(
      texturedImpostorsPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: false })),
    ).toBe(false);
  });

  it('returns false when subsystem is null', () => {
    const state = { subsystems: { texturedImpostors: null } } as unknown as EngineState;
    expect(
      texturedImpostorsPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: true })),
    ).toBe(false);
  });
});

describe('filamentsPass.enabled', () => {
  it('returns true when filamentsEnabled is true (renderer presence checked in draw)', () => {
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: true })),
    ).toBe(true);
  });

  it('returns false when filamentsEnabled is false AND fade opacity is 0', () => {
    // STATE_STUB.fades.opacityOf returns 1 by default — override to 0
    // for this case so the gate doesn't keep the pass alive through a
    // fade-out tail.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
    } as unknown as EngineState;
    expect(
      filamentsPass.enabled(stateZeroFade, makeCtx(), makeSettings({ filamentsEnabled: false })),
    ).toBe(false);
  });

  it('returns true when filamentsEnabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // The STATE_STUB default opacityOf = 1 simulates a fade-out in
    // progress; the gate must keep the pass alive so the user sees
    // the smooth ~100 ms ramp instead of an instant pop.
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: false })),
    ).toBe(true);
  });
});

describe('filamentsPass.draw', () => {
  it('skips drawing when filamentRenderer is null even if enabled', () => {
    // The renderer-null guard lives in `draw` because `enabled` doesn't
    // receive `deps`.  Verify the guard short-circuits cleanly.
    const deps = makeDeps({ filamentRenderer: null });
    // No throw, no call — and there's nothing to spy on since the
    // renderer is null.  We just assert no exception escapes.
    expect(() =>
      filamentsPass.draw(PASS_STUB, makeCtx(), STATE_STUB, makeSettings({ filamentsEnabled: true }), deps),
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
    // Default makeCtx() puts the camera at [0, 0, 5] — 5 Mpc, inside
    // the full-alpha (≤10 Mpc) regime.  Both gates pass.
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: true })),
    ).toBe(true);
  });

  it('returns false when milkyWayEnabled is false AND fade opacity is 0', () => {
    // STATE_STUB's fades.opacityOf returns 1 by default — override
    // to 0 here so the gate doesn't keep the pass alive through a
    // fade-out tail.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
    } as unknown as EngineState;
    expect(
      milkyWayPass.enabled(stateZeroFade, makeCtx(), makeSettings({ milkyWayEnabled: false })),
    ).toBe(false);
  });

  it('returns true when milkyWayEnabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // STATE_STUB.fades.opacityOf returns 1 by default — simulates a
    // toggle fade-out still in flight. The distance-based fadeAlpha
    // also passes (camera at origin), so the gate's second condition
    // is non-zero. Pass renders.
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: false })),
    ).toBe(true);
  });

  it('returns false when camera is beyond the fade band (no empty render pass)', () => {
    // 1000 Mpc — well past FADE_OUTER_MPC (50 Mpc).  Gating in
    // `enabled` (not just `draw`) is what skips the empty
    // beginRenderPass + timestamp-write on the split-encoder path.
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

describe('pointSpritesPass.draw', () => {
  it('packs (source, localIdx) into the selectedPacked u32', () => {
    const ctx = makeCtx();
    const settings = makeSettings({ selected: { source: Source.SDSS, localIdx: 42 } });
    const deps = makeDeps();
    pointSpritesPass.draw(PASS_STUB, ctx, STATE_STUB, settings, deps);
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Selection now lives on arg[3].selectedPacked after the
    // PointDrawSettings refactor — the 16 trailing positional scalars
    // collapsed into a single named-field object.
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

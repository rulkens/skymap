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
  galaxyThumbnailsPass,
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
  const thumbnails = { runFrame: vi.fn() } as any;
  return {
    isReady: true,
    cam,
    vp,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    renderer,
    postProcess,
    thumbnails,
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
    thumbnailRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    clouds: new Map(),
    famousMeta: [],
    famousXrefs: {} as any,
    milkyWayITimeSec: 0,
    ...overrides,
  };
}

// `state` is forwarded through but unread by today's four passes.
// An empty object cast satisfies the type.
const STATE_STUB = {} as EngineState;

const PASS_STUB = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn() } as unknown as GPURenderPassEncoder;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HDR_PASSES registry', () => {
  it('contains the seven HDR passes in canonical draw order', () => {
    // Order is load-bearing for HMR-stability of the encoder record;
    // see passes/index.ts module header.
    // Task R4 added marker-lines + labels after milky-way (passes 6 + 7).
    // Task 8 of the scalar-volume-renderer spec adds scalar-volume after
    // filaments (pass 4).
    expect(HDR_PASSES).toHaveLength(7);
    expect(HDR_PASSES.map((p) => p.name)).toEqual([
      'point-sprites',
      'galaxy-thumbnails',
      'filaments',
      'scalar-volume',
      'milky-way',
      'marker-lines',
      'labels',
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

describe('galaxyThumbnailsPass.enabled', () => {
  it('returns true when galaxyTexturesEnabled is true', () => {
    expect(
      galaxyThumbnailsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ galaxyTexturesEnabled: true })),
    ).toBe(true);
  });

  it('returns false when galaxyTexturesEnabled is false', () => {
    expect(
      galaxyThumbnailsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ galaxyTexturesEnabled: false })),
    ).toBe(false);
  });
});

describe('filamentsPass.enabled', () => {
  it('returns true when filamentsEnabled is true (renderer presence checked in draw)', () => {
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: true })),
    ).toBe(true);
  });

  it('returns false when filamentsEnabled is false', () => {
    expect(
      filamentsPass.enabled(STATE_STUB, makeCtx(), makeSettings({ filamentsEnabled: false })),
    ).toBe(false);
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
  it('returns true when milkyWayEnabled is true (alpha-fade gate is internal to draw)', () => {
    // The user toggle is the gate.  The camera-distance fade lives
    // inside `draw` so a single fade-alpha read covers both gating
    // and the actual draw — see the milkyWayPass module header.
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: true })),
    ).toBe(true);
  });

  it('returns false when milkyWayEnabled is false', () => {
    expect(
      milkyWayPass.enabled(STATE_STUB, makeCtx(), makeSettings({ milkyWayEnabled: false })),
    ).toBe(false);
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

  it('skips draw when camera is far beyond the fade band', () => {
    const drawSpy = vi.fn();
    const deps = makeDeps({ milkyWayRenderer: { draw: drawSpy } as any });
    // 1000 Mpc — well past FADE_OUTER_MPC (50 Mpc).
    const ctx = makeCtx({
      drawCamPos: [1000, 0, 0] as Readonly<[number, number, number]>,
    });
    milkyWayPass.draw(PASS_STUB, ctx, STATE_STUB, makeSettings(), deps);
    expect(drawSpy).not.toHaveBeenCalled();
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

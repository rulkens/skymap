/**
 * horizonShellPass — the distance-fade gate in `enabled` and the `draw` call's
 * arguments, against stub state + ctx with no GPU device. `draw` must thread the
 * resolved `SlabView`'s `viewportPx` rather than reading `ctx.canvasSize` directly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { horizonShellPass } from '../../../../src/layers/cosmicHorizon/passes/horizonShellPass';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import { COSMO, slabViewOf } from '../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { CosmicHorizonRuntime } from '../../../../src/layers/cosmicHorizon/@types/CosmicHorizonRuntime';

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
 * Build a FrameView with stub GPU/subsystem handles. The tests
 * only inspect a subset (camera position, vp, canvas size, plus the
 * renderer mock for `draw`); the rest satisfy the type.
 *
 * `slabs` carries a real cosmological row (built from this ctx's own
 * `vp`/`drawCamPos`) so `slabViewOf(ctx, COSMO)` — the same resolution the
 * production encoders perform once per frame — works against these
 * fixtures without a bespoke double.
 */
function makeCtx(overrides: { drawCamPos?: Readonly<[number, number, number]> } = {}): FrameView {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  const renderTargets = { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any;
  const drawCamPos = [0, 0, 5] as Readonly<[number, number, number]>;
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
      renderTargets,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
      plans: createFramePlannerResultStore(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    cam,
    vp,
    // NEAR0 duplicates the cosmological row — nothing in this file resolves
    // it, but a real `Slab` at both indices keeps `ctx.slabs` shaped like a
    // live frame without a bespoke near-field double.
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    // Nothing in this file reads bodyPose — a stub that never resolves a
    // body is a safe default.
    bodyPose: () => null,
    ...overrides,
  } as unknown as FrameView;
}

// The pass reads nothing off state; an empty stub satisfies the signature.
const STATE_STUB = {} as unknown as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makePass(draw = vi.fn()) {
  return horizonShellPass({ renderer: { draw } } as unknown as CosmicHorizonRuntime);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('horizonShellPass.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the layer is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    const ctx0 = makeCtx();
    expect(makePass().enabled(STATE_STUB, ctx0, slabViewOf(ctx0, COSMO))).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(makePass().enabled(STATE_STUB, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });
});

describe('horizonShellPass.draw', () => {
  it('forwards the distance-fade alpha as the 4th draw arg', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    makePass(drawSpy).draw(PASS_STUB, view, ctx, STATE_STUB);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    expect(args[2]).toEqual(view.viewportPx);
    // 8 Gpc is past the full-strength point → alpha 1.0.
    expect(args[3]).toBe(1.0);
  });
});

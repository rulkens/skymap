/**
 * passes — the per-pass `enabled` gates against stub state + ctx with no GPU
 * device. The spot-checked `draw` calls pin that a pass threads the resolved
 * `SlabView`'s `vp`/`viewportPx` rather than reading `ctx.vp`/`ctx.canvasSize`
 * directly.
 *
 * Encoder sequencing and the post-process chain live in `renderFrame.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { horizonShellPass } from '../../../../../src/services/engine/frame/passes/horizonShellPass';
import { structureMarkersPass } from '../../../../../src/services/engine/frame/passes/structureMarkersPass';
import { structureMarkersPlanner } from '../../../../../src/services/engine/frame/planners/structureMarkersPlanner';
import { createFramePlannerResultStore } from '../../../../../src/services/engine/frame/createFramePlannerResultStore';
import { COSMO, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { StructureMarkerDescriptor } from '../../../../../src/@types/rendering/StructureMarkerDescriptor';

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
      visibleSourceMask: 0xffffffff,
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

// `state` is forwarded through — most passes ignore it, but a fades stub
// returning full opacity lets the ones that ask run without a live
// FadeRegistry.
const STATE_STUB = {
  subsystems: {
    fades: {
      opacityOf: () => 1,
      isAnyAnimating: () => false,
    },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
  // Passes bind the shared focus group off state.gpu.focusUniform; an opaque
  // bind group is all they read. The nullable GPU renderer fields default to
  // null (pre-bootstrap shape); individual draw tests override the one they
  // exercise.
  gpu: {
    focusUniform: { bindGroup: {} as GPUBindGroup, write: () => {}, destroy: () => {} },
    horizonShellRenderer: null,
  },
} as unknown as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// ── Tests ───────────────────────────────────────────────────────────────────

// The starAggregatesPass/starAggregateUpsamplePass producer/consumer gate
// pin moved to `tests/layers/starCatalog/passes/starAggregateUpsamplePass.test.ts`
// with the rest of the starCatalog Layer's own pass tests.

// Coverage for the `textured-disks` layer lives in
// `texturedDisksPass.test.ts` (one test file per ContentPass module,
// matching the convention used by every other entry in `passes/`). The
// hdr-target layers check above pins the name in canonical order.

// milkyWayPass's `enabled`/`draw`/`pickEnabled` coverage moved to
// `tests/layers/milkyWay/passes/milkyWayPass.test.ts` with the rest of the
// milkyWay Layer's own pass tests.

describe('horizonShellPass.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the layer is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    const ctx0 = makeCtx();
    expect(horizonShellPass.enabled(STATE_STUB, ctx0, slabViewOf(ctx0, COSMO))).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(horizonShellPass.enabled(STATE_STUB, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });
});

describe('horizonShellPass.draw', () => {
  it('forwards the distance-fade alpha as the 4th draw arg', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, horizonShellRenderer: { draw: drawSpy } },
    } as unknown as EngineState;
    horizonShellPass.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    expect(args[2]).toEqual(view.viewportPx);
    // 8 Gpc is past the full-strength point → alpha 1.0.
    expect(args[3]).toBe(1.0);
  });
});

/** Plan `count` markers for `ctx`, the way SCENE's own plan row does. */
function planMarkers(ctx: FrameView, count: number): FrameView {
  ctx.snapshot.plans.put(structureMarkersPlanner, ctx, {
    value: Array.from({ length: count }, () => ({}) as StructureMarkerDescriptor),
    awake: false,
    settling: false,
  });
  return ctx;
}

// The renderer has uploaded nothing: `setMarkers` runs inside `draw`, which
// this gate is what admits, so a gate reading `markerCount()` would be false
// on every frame and the markers would never appear.
const EMPTY_RENDERER_STATE = {
  ...STATE_STUB,
  gpu: { ...STATE_STUB.gpu, structureMarkerRenderer: { markerCount: () => 0 } },
} as unknown as EngineState;

describe('structureMarkersPass.enabled', () => {
  it('gates on the PLANNED markers, not on what the renderer last uploaded', () => {
    const ctx = planMarkers(makeCtx(), 3);
    expect(structureMarkersPass.enabled(EMPTY_RENDERER_STATE, ctx, slabViewOf(ctx, COSMO))).toBe(
      true,
    );
  });

  it('an empty planned list leaves the pass plan', () => {
    const ctx = planMarkers(makeCtx(), 0);
    expect(structureMarkersPass.enabled(EMPTY_RENDERER_STATE, ctx, slabViewOf(ctx, COSMO))).toBe(
      false,
    );
  });

  it('disables once the surveyDeepZoom fade completes (opacity-zero principle)', () => {
    // Every marker fragment resolves to alpha 0 past the goneAt edge, so the
    // layer must leave the pass plan entirely — the executor drops the render
    // step, and `pickEnabled` applies the same band so the rings stop claiming
    // hits.
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, structureMarkerRenderer: { markerCount: () => 3 } },
    } as unknown as EngineState;
    // Default fixture camera: 5 Mpc from origin, far outside the band.
    const farCtx = planMarkers(makeCtx(), 3);
    expect(structureMarkersPass.enabled(state, farCtx, slabViewOf(farCtx, COSMO))).toBe(true);
    // Inside goneAt (0.002 Mpc) → disabled despite queued markers.
    const nearCtx = planMarkers(
      makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> }),
      3,
    );
    expect(structureMarkersPass.enabled(state, nearCtx, slabViewOf(nearCtx, COSMO))).toBe(false);
  });
});

describe('structureMarkersPass.pickEnabled', () => {
  // The pick program derives its own context, whose `plans` no plan row has
  // filled — reading the planned list there would throw, so the pick gate
  // reads the renderer's own upload instead.
  it('reads the renderer, never the plan the pick context never ran', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(structureMarkersPass.pickEnabled!(EMPTY_RENDERER_STATE, ctx, view)).toBe(false);
    const uploaded = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, structureMarkerRenderer: { markerCount: () => 3 } },
    } as unknown as EngineState;
    expect(structureMarkersPass.pickEnabled!(uploaded, ctx, view)).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { clipPathDebugLayer } from '../../../../../src/services/engine/frame/passes/clipPathDebugLayer';
import { NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { foregroundFrustum } from '../../../../../src/utils/camera/foregroundFrustum';
import { computeForegroundViewProj } from '../../../../../src/utils/camera/computeForegroundViewProj';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ClipPathSnapshot } from '../../../../../src/@types/engine/debug/ClipPathSnapshot';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Mat4 } from 'wgpu-matrix';

/**
 * The clip-path overlay projects through NEAR0 (see the layer header): a
 * near-field clip's route — Earth-to-parsec — sits wholly inside COSMO's fixed
 * 10 kpc near plane and would be clipped to nothing, so the overlay rides the
 * near-field slab's adaptive, near-clip-immune frustum and rebases into a
 * camera-relative frame. The fixture therefore builds a REAL NEAR0 slab (an
 * origin-relative f64 foreground view-proj at a parsec-scale camera) at
 * `ctx.slabs[NEAR0]`, the row `slabViewOf(ctx, NEAR0)` resolves.
 */
const CAM_POS: Vec3 = [3e-7, -1e-7, 2e-7]; // parsec-scale eye (starSpiral regime)
const TARGET_POS: Vec3 = [3.2e-7, -1e-7, 2e-7];

function makeCtx(): ReadyFrameContext {
  const { near, far } = foregroundFrustum(2e-7);
  const near0Vp = computeForegroundViewProj({
    eyeMpc: CAM_POS,
    targetMpc: TARGET_POS,
    up: [0, 1, 0],
    renderOrigin: [0, 0, 0],
    fovYRad: (60 * Math.PI) / 180,
    aspect: 1280 / 720,
    near,
    far,
    reversedZ: true,
  });
  const near0Slab: Slab = {
    index: NEAR0,
    nearMpc: near,
    farMpc: far,
    vp: near0Vp,
    originRelative: true,
    precision: 'f64',
    reversedZ: true,
  };
  return {
    isReady: true,
    renderedTargets: new Set<string>(),
    cam: {} as never,
    vp: Float32Array.from(near0Vp) as unknown as Mat4,
    // slabViewOf(ctx, NEAR0) indexes ctx.slabs[NEAR0] (index 0).
    slabs: [near0Slab, near0Slab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: CAM_POS as Readonly<[number, number, number]>,
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

function makeRendererSpy() {
  return {
    label: 'debugLineRenderer',
    setLines: vi.fn(),
    draw: vi.fn(),
    lineCount: vi.fn(),
    destroy: vi.fn(),
  };
}

// A near-field route in absolute world coordinates (parsec scale). The eye
// positions are what a near-field clip like starSpiral produces.
const EYE_A: Vec3 = [1e-7, 0, 0];
const EYE_B: Vec3 = [4e-7, 1e-7, -2e-7];
const SNAPSHOT: ClipPathSnapshot = {
  clipId: 'demo' as ClipPathSnapshot['clipId'],
  durationSec: 10,
  samples: [
    { t: 0, eye: EYE_A, target: [1.1e-7, 0, 0], distance: 2e-7, speed01: 0 },
    { t: 10, eye: EYE_B, target: [4.1e-7, 1e-7, -2e-7], distance: 2e-7, speed01: 1 },
  ],
};

function makeState(opts: {
  renderer: ReturnType<typeof makeRendererSpy> | null;
  snapshot: ClipPathSnapshot | null;
  scrub01?: number;
}): EngineState {
  return {
    gpu: { debugLineRenderer: opts.renderer },
    subsystems: { clipPathInspector: { current: () => opts.snapshot } },
    settings: { debug: { clipPathInspect: { clipId: 'demo', scrub01: opts.scrub01 ?? 0 } } },
  } as unknown as EngineState;
}

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

describe('clipPathDebugLayer.enabled', () => {
  it('is false when the renderer is null', () => {
    const state = makeState({ renderer: null, snapshot: SNAPSHOT });
    expect(clipPathDebugLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('is false when there is no snapshot', () => {
    const state = makeState({ renderer: makeRendererSpy(), snapshot: null });
    expect(clipPathDebugLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('is true when renderer + snapshot both present', () => {
    const state = makeState({ renderer: makeRendererSpy(), snapshot: SNAPSHOT });
    expect(clipPathDebugLayer.enabled(state, makeCtx())).toBe(true);
  });
});

describe('clipPathDebugLayer.draw', () => {
  it('builds lines from the snapshot and forwards to setLines + draw', () => {
    const renderer = makeRendererSpy();
    const state = makeState({ renderer, snapshot: SNAPSHOT, scrub01: 0 });
    const ctx = makeCtx();
    clipPathDebugLayer.draw(PASS_STUB, slabViewOf(ctx, NEAR0), ctx, state);

    expect(renderer.setLines).toHaveBeenCalledOnce();
    const lines = renderer.setLines.mock.calls[0]![0]!;
    // 1 route segment + 1 target segment (2 samples → 1 pair each) + 9 gizmo lines
    expect(lines.length).toBe(11);

    expect(renderer.draw).toHaveBeenCalledOnce();
    // viewport is draw's 3rd arg
    expect(renderer.draw.mock.calls[0]![2]).toEqual([1280, 720]);
  });

  it('rebases every line endpoint into the camera-relative frame', () => {
    // The load-bearing regression: at parsec scale the raw world positions and
    // the NEAR0 vp's view translation are near-identical tiny magnitudes whose
    // f32 subtraction cancels catastrophically. The layer must hand the renderer
    // camera-relative endpoints (world − camPos) that pair with the rebased vp,
    // so the route survives instead of hopping (or, on COSMO, vanishing wholly
    // inside the near plane). The first route segment is EYE_A → EYE_B.
    const renderer = makeRendererSpy();
    const state = makeState({ renderer, snapshot: SNAPSHOT, scrub01: 0 });
    const ctx = makeCtx();
    clipPathDebugLayer.draw(PASS_STUB, slabViewOf(ctx, NEAR0), ctx, state);

    const routeSeg = renderer.setLines.mock.calls[0]![0]![0]!;
    const relA: Vec3 = [EYE_A[0] - CAM_POS[0], EYE_A[1] - CAM_POS[1], EYE_A[2] - CAM_POS[2]];
    const relB: Vec3 = [EYE_B[0] - CAM_POS[0], EYE_B[1] - CAM_POS[1], EYE_B[2] - CAM_POS[2]];
    expect(routeSeg.from).toEqual(relA);
    expect(routeSeg.to).toEqual(relB);
  });

  it('draws through a rebased vp, not the raw slab view-projection', () => {
    // Pairing the camera-relative endpoints above with the un-rebased vp would
    // double-subtract the eye and throw the route off-screen. The vp handed to
    // the renderer must be the rebased one — distinct from the slab's raw vp
    // whenever the camera sits off the render origin.
    const renderer = makeRendererSpy();
    const state = makeState({ renderer, snapshot: SNAPSHOT, scrub01: 0 });
    const ctx = makeCtx();
    const view = slabViewOf(ctx, NEAR0);
    clipPathDebugLayer.draw(PASS_STUB, view, ctx, state);

    const usedVp = renderer.draw.mock.calls[0]![1]! as Float32Array;
    expect(Array.from(usedVp)).not.toEqual(Array.from(view.vp));
  });
});

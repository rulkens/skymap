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

import { filamentsPass } from '../../../../../src/layers/filaments/passes/filamentsPass';
import { milkyWayPass } from '../../../../../src/services/engine/frame/passes/milkyWayPass';
import { horizonShellPass } from '../../../../../src/services/engine/frame/passes/horizonShellPass';
import { starAggregatesPass } from '../../../../../src/services/engine/frame/passes/starAggregatesPass';
import { starAggregateUpsamplePass } from '../../../../../src/services/engine/frame/passes/starAggregateUpsamplePass';
import { structureMarkersPass } from '../../../../../src/services/engine/frame/passes/structureMarkersPass';
import { COSMO, NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

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
 *
 * `slabs` carries a real cosmological row (built from this ctx's own
 * `vp`/`drawCamPos`) so `slabViewOf(ctx, COSMO)` — the same resolution the
 * production encoders perform once per frame — works against these
 * fixtures without a bespoke double.
 */
function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  const renderTargets = { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any;
  const drawCamPos = [0, 0, 5] as Readonly<[number, number, number]>;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    isReady: true,
    viewSlot: 0,
    renderedTargets: new Set<string>(),
    cam,
    vp,
    // Index 0 (NEAR0) duplicates the cosmological row: the milky-way draw
    // tests resolve slabViewOf(ctx, NEAR0) (the layer's slab), and reusing
    // the cosmo fixture there gives them a real vp without a bespoke
    // near-field double.
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    simDays: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    layersAnimating: false,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderTargets,
    // Nothing in this file reads bodyPose — a stub that never resolves a
    // body is a safe default, overridable like every other field.
    bodyPose: () => null,
    ...overrides,
  };
}

// Knob-derived camera distances for the Milky-Way apparent-size fade band,
// under the stub ctx's camera (60° vertical fov, 720-px-tall viewport).
// Inverting apparentDiameterPx: the disc (diameter 2·R) spans exactly `px`
// on screen at distance 2·R·pxPerRad / px. Deriving the fixtures from the
// calibration knobs (rather than hardcoding Mpc values) keeps these tests
// green across visual-gate re-tunes of the band edges.
const MW_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));
const MW_FULL_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_FULL_PX;
const MW_GONE_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_GONE_PX;

// The generated star/dust buffers the milky-way layer reads off
// `state.gpu.milkyWayCloud.buffers()`. A stable reference so `draw` tests can
// assert the exact snapshot was forwarded to the renderer.
const MW_CLOUD_BUFFERS = {
  starBuf: {} as GPUBuffer,
  starCount: 3,
  dustBuf: null,
  dustCount: 0,
};

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
  // The Milky-Way rows' `draw` now goes through the same
  // `deriveMilkyWayCloudAlpha` gate their `enabled` does (one liveness
  // projection shared by the aggregate producer, its upsample consumer, and
  // the dust pass), and that gate reads `settings.milkyWay.enabled` — so the
  // baseline stub has to carry it or `draw` throws before reaching the
  // renderer. Tests that need the toggle off override `settings` wholesale.
  settings: { milkyWay: { enabled: true } },
  // Passes bind the shared focus group off state.gpu.focusUniform; an opaque
  // bind group is all they read. The nullable GPU renderer fields default to
  // null (pre-bootstrap shape); individual draw tests override the one they
  // exercise.
  gpu: {
    focusUniform: { bindGroup: {} as GPUBindGroup, write: () => {}, destroy: () => {} },
    // milkyWayPass.draw reads the generated cloud buffers off this handle.
    milkyWayCloud: { buffers: () => MW_CLOUD_BUFFERS },
    milkyWayCloudRenderer: null,
    horizonShellRenderer: null,
    filamentRenderer: null,
    flowFieldRenderer: null,
    volumeFieldRenderer: null,
  },
} as unknown as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('starAggregatesPass registry row', () => {
  it('shares ONE visibility gate with its upsample consumer', () => {
    // Producer and consumer are the same function by identity, so a frame can
    // never composite a stale offscreen the producer skipped clearing.
    expect(starAggregateUpsamplePass.enabled).toBe(starAggregatesPass.enabled);
  });
});

// Coverage for the `textured-disks` layer lives in
// `texturedDisksPass.test.ts` (one test file per ContentPass module,
// matching the convention used by every other entry in `passes/`). The
// hdr-target layers check above pins the name in canonical order.

describe('filamentsPass.enabled', () => {
  it('returns false when filaments.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsPass.enabled(stateZeroFade, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });

  it('returns true when filaments.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // STATE_STUB's opacityOf = 1 simulates a fade-out in progress; the
    // gate keeps the layer alive so the user sees the smooth ~100 ms ramp
    // instead of an instant pop.
    const stateOffFading = {
      ...STATE_STUB,
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsPass.enabled(stateOffFading, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });
});

describe('filamentsPass.draw', () => {
  it('threads the SlabView vp/viewport to filamentRenderer.draw when present', () => {
    // This is the representative "draw threads the SlabView" check: the
    // layer must forward the SlabView's `vp`/`viewportPx` — NOT
    // `ctx.vp`/`ctx.canvasSize` directly.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    // intensity=0.7 now comes from state.settings.filaments.intensity.
    const stateWith07 = {
      ...STATE_STUB,
      settings: { filaments: { enabled: true, intensity: 0.7 } },
      gpu: { ...STATE_STUB.gpu, filamentRenderer: { draw: drawSpy } },
    } as unknown as EngineState;
    filamentsPass.draw(PASS_STUB, view, ctx, stateWith07);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toEqual(view.viewportPx);
    expect(args[3]).toBe(1.5); // line halfwidth (FILAMENT_LINE_HALFWIDTH_PX)
    expect(args[4]).toBe(0.7);
  });
});

describe('milkyWayPass.enabled', () => {
  it('returns true when milkyWay.enabled is true and the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX, safely full-alpha. Both gates pass.
    const stateOn = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });

  it('returns false when milkyWay.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateOffZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(milkyWayPass.enabled(stateOffZeroFade, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });

  it('returns true when milkyWay.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // opacityOf = 1 simulates a toggle fade-out still in flight, and the
    // apparent-size fadeAlpha also passes (camera well inside the FULL
    // distance), so the gate's second condition is non-zero — the layer
    // renders.
    const stateOffFading = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOffFading, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });

  it('returns false once the disc shrinks past the GONE apparent size (no empty render pass)', () => {
    // Twice the GONE-threshold distance → apparent diameter is half
    // MILKY_WAY_FADE_GONE_PX, safely past the band → alpha 0. Gating in
    // `enabled` (not just `draw`) skips the empty beginRenderPass +
    // timestamp-write on the split-encoder path.
    const stateOn = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [MW_GONE_DIST_MPC * 2, 0, 0] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });
});

describe('milkyWayPass.draw', () => {
  it('calls state.gpu.milkyWayCloudRenderer.drawDust with the packed args when the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX — fadeAlpha should be 1.0.
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    // NEAR0 — the layer's slab since the fixed COSMO near plane clipped the
    // disc mid-descent (the fixture duplicates the cosmo row at index 0, so
    // the resolved view carries the same vp).
    const view = slabViewOf(ctx, NEAR0);
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, milkyWayCloudRenderer: { drawDust: drawSpy } },
    } as unknown as EngineState;
    milkyWayPass.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // This row draws ONLY the dust pass now — the additive star pass moved to
    // milkyWayAggregatePass, which renders it into the reduced-resolution
    // `mw-aggregate` offscreen. Signature: drawDust(pass, MilkyWayCloudDrawArgs).
    const [passArg, args] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(args.vp).toBe(view.vp);
    expect(args.viewportPx).toEqual(view.viewportPx);
    // fadeAlpha above the FULL threshold is 1.0 (full strength).
    expect(args.fadeAlpha).toBe(1.0);
    // The generated buffer snapshot is forwarded verbatim.
    expect(args.buffers).toBe(MW_CLOUD_BUFFERS);
    // Billboard basis (from cameraBillboardBasis(ctx.cam)) + the fixed model
    // matrix are packed as plain vectors / a 16-float column-major matrix.
    expect(args.camRight).toHaveLength(3);
    expect(args.camUp).toHaveLength(3);
    expect(args.model).toHaveLength(16);
  });
});

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

describe('structureMarkersPass.enabled', () => {
  it('disables once the surveyDeepZoom fade completes (opacity-zero principle)', () => {
    // Every marker fragment resolves to alpha 0 past the goneAt edge, so the
    // layer must leave the pass plan entirely — the executor drops the
    // render step, and the pick program (which runs this same gate) stops
    // the rings claiming hits.
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, structureMarkerRenderer: { markerCount: () => 3 } },
    } as unknown as EngineState;
    // Default fixture camera: 5 Mpc from origin, far outside the band.
    const farCtx = makeCtx();
    expect(structureMarkersPass.enabled(state, farCtx, slabViewOf(farCtx, COSMO))).toBe(true);
    // Inside goneAt (0.002 Mpc) → disabled despite queued markers.
    const nearCtx = makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> });
    expect(structureMarkersPass.enabled(state, nearCtx, slabViewOf(nearCtx, COSMO))).toBe(false);
  });
});

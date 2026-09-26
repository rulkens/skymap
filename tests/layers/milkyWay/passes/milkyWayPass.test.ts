/**
 * milkyWayPass — the DUST draw + the one registry row whose pick set is
 * NARROWER than its draw set. Its hit target is a disc sized from the
 * galaxy's physical radius, so the footprint grows without bound as the
 * camera closes; with the pick fold being SLAB-ordered (any NEAR0 hit beats
 * every COSMO one regardless of depth), a screen-filling backdrop would
 * swallow every click made from inside the disc.
 */

import { describe, it, expect, vi } from 'vitest';

import { milkyWayPass } from '../../../../src/layers/milkyWay/passes/milkyWayPass';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { MilkyWayRuntime } from '../../../../src/layers/milkyWay/@types/MilkyWayRuntime';

// Neither `enabled` nor `pickEnabled` reads `view` — both derive their answer
// from ctx/state alone — so an opaque stub satisfies the 3-arg signature.
const VIEW_STUB = {} as unknown as SlabView;

// `enabled`/`pickEnabled` never touch the runtime — only `draw`/`drawPick`
// read `cloud`/`cloudRenderer`/`pickRenderer` — so an opaque stub suffices.
const PASS = milkyWayPass({} as unknown as MilkyWayRuntime);

// Toggle on and fully faded in, so both gates reduce to camera distance.
// `opacityOf` is a MULTIPLIER in `deriveMilkyWayCloudAlpha`, not a fade-tail
// fallback OR'd against the toggle: 0 here makes every case vacuously unpickable.
const STATE = {
  settings: { milkyWay: { enabled: true } },
  subsystems: {
    fades: { opacityOf: () => 1, isAnyAnimating: () => false },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
} as unknown as EngineState;

// 720-px viewport, 60° fovY, tangent-exact.
const MW_PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 3 / 2));

function makeCtx(camPos: Readonly<Vec3>): FrameView {
  return {
    // resolveLayerOpacity lerps its recession factor on snapshot.focusBlend;
    // an absent one makes the composed alpha NaN.
    snapshot: { nowMs: 0, focusBlend: 0 },
    cam: { distance: Math.hypot(...camPos) },
    drawCamPos: camPos,
    drawPxPerRad: MW_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
    viewportPx: [1280, 720],
  } as unknown as FrameView;
}

describe('milkyWayPass pick vs draw', () => {
  it('keeps drawing but stops taking clicks once the camera is inside the disc', () => {
    // Well inside the impostor, still an order of magnitude outside the 2 kpc
    // approach fade: the disc is DRAWN at full strength here.
    const inside = makeCtx([0, 0, 0.02]);
    expect(inside.cam.distance).toBeGreaterThan(SCALE_FADE_BANDS.milkyWayApproachSun.fullAt);
    expect(PASS.enabled(STATE, inside, VIEW_STUB)).toBe(true);
    expect(PASS.pickEnabled!(STATE, inside, VIEW_STUB)).toBe(false);

    // Framing the galaxy from outside: draw and pick agree again.
    const outside = makeCtx([0, 0, 0.15]);
    expect(PASS.enabled(STATE, outside, VIEW_STUB)).toBe(true);
    expect(PASS.pickEnabled!(STATE, outside, VIEW_STUB)).toBe(true);
  });

  it('stays unpickable wherever it is invisible — pick is a strict subset of draw', () => {
    // `pickEnabled` composes over `enabled` rather than restating its terms, so an
    // invisible disc cannot come back as a click target.
    const dissolved = makeCtx([0, 0, SCALE_FADE_BANDS.milkyWayApproachSun.goneAt / 2]);
    expect(PASS.enabled(STATE, dissolved, VIEW_STUB)).toBe(false);
    expect(PASS.pickEnabled!(STATE, dissolved, VIEW_STUB)).toBe(false);
  });
});

// Fade-band camera distances derived from the calibration knobs. Inverting
// apparentDiameterPx: the disc (diameter 2·R) spans exactly `px` on screen
// at distance 2·R·pxPerRad / px.
const MW_FULL_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_FULL_PX;
const MW_GONE_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_GONE_PX;

// The generated star/dust buffers the layer reads off `runtime.cloud.buffers()`.
// A stable reference so the draw test can assert the exact snapshot forwarded
// to the renderer.
const MW_CLOUD_BUFFERS = {
  starBuf: {} as GPUBuffer,
  starCount: 3,
  dustBuf: null,
  dustCount: 0,
};

describe('milkyWayPass.enabled — apparent-size band', () => {
  it('returns true when milkyWay.enabled is true and the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX, safely full-alpha. Both gates pass.
    const ctx = makeCtx([0, 0, MW_FULL_DIST_MPC / 2]);
    expect(PASS.enabled(STATE, ctx, VIEW_STUB)).toBe(true);
  });

  it('returns false when milkyWay.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateOffZeroFade = {
      subsystems: {
        fades: { opacityOf: () => 0, isAnyAnimating: () => false },
        clipPlayer: { clipOpacityOf: () => 1 },
      },
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx([0, 0, MW_FULL_DIST_MPC / 2]);
    expect(PASS.enabled(stateOffZeroFade, ctx, VIEW_STUB)).toBe(false);
  });

  it('returns true when milkyWay.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // opacityOf = 1 simulates a toggle fade-out still in flight, and the
    // apparent-size fadeAlpha also passes (camera well inside the FULL
    // distance), so the gate's second condition is non-zero — the layer
    // renders.
    const stateOffFading = {
      ...STATE,
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx([0, 0, MW_FULL_DIST_MPC / 2]);
    expect(PASS.enabled(stateOffFading, ctx, VIEW_STUB)).toBe(true);
  });

  it('returns false once the disc shrinks past the GONE apparent size (no empty render pass)', () => {
    // Twice the GONE-threshold distance → apparent diameter is half
    // MILKY_WAY_FADE_GONE_PX, safely past the band → alpha 0. Gating in
    // `enabled` (not just `draw`) skips the empty beginRenderPass +
    // timestamp-write on the split-encoder path.
    const ctx = makeCtx([MW_GONE_DIST_MPC * 2, 0, 0]);
    expect(PASS.enabled(STATE, ctx, VIEW_STUB)).toBe(false);
  });
});

describe('milkyWayPass.draw', () => {
  it('calls cloudRenderer.drawDust with the packed args when the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX — fadeAlpha should be 1.0.
    const drawSpy = vi.fn();
    const ctx = makeCtx([0, 0, MW_FULL_DIST_MPC / 2]);
    const view = {
      vp: {} as unknown as FrameView['drawCamPos'],
      viewportPx: [1280, 720],
    } as unknown as SlabView;
    const passStub = {
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const runtime = {
      cloud: { buffers: () => MW_CLOUD_BUFFERS },
      cloudRenderer: { drawDust: drawSpy },
    } as unknown as MilkyWayRuntime;
    milkyWayPass(runtime).draw(passStub, view, ctx, STATE);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // This row draws ONLY the dust pass — the additive star pass lives in
    // milkyWayAggregatePass, which renders it into the reduced-resolution
    // `mw-aggregate` offscreen. Signature: drawDust(pass, MilkyWayCloudDrawArgs).
    const [passArg, args] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(passStub);
    expect(args.vp).toBe(view.vp);
    expect(args.viewportPx).toEqual(view.viewportPx);
    // fadeAlpha above the FULL threshold is 1.0 (full strength).
    expect(args.fadeAlpha).toBe(1.0);
    // The generated buffer snapshot is forwarded verbatim.
    expect(args.buffers).toBe(MW_CLOUD_BUFFERS);
    // The model-space eye (from milkyWayCamPosModel(ctx.drawCamPos)) + the
    // fixed model matrix are packed as a plain vector / a 16-float
    // column-major matrix.
    expect(args.camPosModel).toHaveLength(3);
    expect(args.model).toHaveLength(16);
  });
});

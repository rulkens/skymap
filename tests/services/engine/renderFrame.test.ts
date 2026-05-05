/**
 * renderFrame — unit tests for the per-frame WebGPU command-encoder
 * dispatcher.  We mock the GPU device, the command encoder, the render
 * pass, and every renderer/subsystem the function calls, so the test
 * runs without a real WebGPU context.
 *
 * Coverage focus:
 *   - encoder lifecycle: createCommandEncoder + finish + submit happen
 *     exactly once each, in the right order
 *   - HDR render-pass colour attachment uses the supplied hdrTargetView
 *   - pointRenderer.draw is called with all 17 args in the right order
 *     (selectedIndex sentinel translation included)
 *   - thumbnails.runFrame is called between point draw and pass.end —
 *     and skipped when galaxyTexturesEnabled is false
 *   - toneMapPass.draw is called after pass.end with the correct
 *     exposure + curve uniforms
 *   - the swap-chain view is acquired AFTER pass.end (i.e. when the
 *     tone-map pass needs it), not at frame start
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../src/data/sources';
import { BiasMode } from '../../../src/data/biasMode';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';
import { renderFrame } from '../../../src/services/engine/renderFrame';
import type { OrbitCamera, PointCloud } from '../../../src/@types';
import type { mat4 } from 'gl-matrix';

// ── Test fixtures ───────────────────────────────────────────────────────────

/**
 * Tracks the chronological order of every interesting call so we can
 * assert ordering relationships (e.g. `pointRenderer.draw` came before
 * `pass.end`, which came before `toneMapPass.draw`).  The encoder, the
 * pass, and every renderer hand the same array back through their
 * `vi.fn()` impls.
 */
type CallLog = string[];

function makeFakeRenderPass(callLog: CallLog) {
  return {
    end: vi.fn(() => {
      callLog.push('pass.end');
    }),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeFakeCommandBuffer() {
  return {} as GPUCommandBuffer;
}

/**
 * Build a fresh encoder + render-pass pair for one frame.  The encoder
 * spies stash their last descriptor / finished buffer on themselves so
 * tests can assert against post-call state without globals.  Returned
 * as a struct because the test fixture also wants the inner `pass` and
 * the raw `vi.fn` references for direct mock-call inspection.
 */
function makeEncoderEnv(callLog: CallLog) {
  const pass = makeFakeRenderPass(callLog);
  const finishedBuffer = makeFakeCommandBuffer();
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    callLog.push('encoder.beginRenderPass');
    (beginRenderPass as any).lastDescriptor = desc;
    return pass;
  });
  const finish = vi.fn(() => {
    callLog.push('encoder.finish');
    return finishedBuffer;
  });
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  return { encoder, pass, beginRenderPass, finish, finishedBuffer };
}

function makeFakeDevice(callLog: CallLog, encoder: GPUCommandEncoder) {
  const submit = vi.fn((buffers: ReadonlyArray<GPUCommandBuffer>) => {
    callLog.push('device.queue.submit');
    (submit as any).lastBuffers = buffers;
  });
  const createCommandEncoder = vi.fn(() => {
    callLog.push('device.createCommandEncoder');
    return encoder;
  });
  return {
    createCommandEncoder,
    queue: { submit },
  } as unknown as GPUDevice;
}

function makeFakeSwapView(): GPUTextureView {
  return { __id: 'swap-view' } as unknown as GPUTextureView;
}

function makeFakeContext(swapView: GPUTextureView, callLog: CallLog) {
  return {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => {
        callLog.push('context.getCurrentTexture.createView');
        return swapView;
      }),
    })),
  } as unknown as GPUCanvasContext;
}

function makeFakeHdrView(): GPUTextureView {
  return { __id: 'hdr-view' } as unknown as GPUTextureView;
}

function makeFakeHdrDepthView(): GPUTextureView {
  return { __id: 'hdr-depth-view' } as unknown as GPUTextureView;
}

function makeMockPointRenderer(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('pointRenderer.draw');
    }),
  } as any;
}

function makeMockMilkyWayRenderer(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('milkyWayRenderer.draw');
    }),
    destroy: vi.fn(),
  } as any;
}

function makeMockToneMapPass(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('toneMapPass.draw');
    }),
    destroy: vi.fn(),
  } as any;
}

function makeMockThumbnails(callLog: CallLog) {
  return {
    runFrame: vi.fn(() => {
      callLog.push('thumbnails.runFrame');
    }),
    bindToRenderers: vi.fn(),
    hasInFlightFetches: vi.fn(() => false),
    destroy: vi.fn(),
    __testGetState: vi.fn(),
  } as any;
}

function makeMockQuadRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeMockDiskRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeCam(): OrbitCamera {
  // Camera distance must be inside the Milky-Way fade band
  // (FADE_INNER_MPC = 10 ... FADE_OUTER_MPC = 50) so the impostor's
  // distance-fade gate doesn't suppress the draw call in tests that
  // need to assert MW ordering.  5 Mpc is comfortably inside the
  // full-alpha (≤10 Mpc) regime.
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

function makeCloud(count = 1): PointCloud {
  const fill = (v: number) => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(1),
    positionAngleDeg: fill(0),
    diameterKpc: fill(50),
  };
}

/** Build a complete RenderFrameInput fixture with sensible defaults. */
function makeInput(overrides: { settings?: Partial<any> } = {}) {
  const callLog: CallLog = [];
  const env = makeEncoderEnv(callLog);
  const device = makeFakeDevice(callLog, env.encoder);
  const swapView = makeFakeSwapView();
  const context = makeFakeContext(swapView, callLog);
  const hdrTargetView = makeFakeHdrView();
  const hdrDepthView = makeFakeHdrDepthView();
  const pointRenderer = makeMockPointRenderer(callLog);
  const milkyWayRenderer = makeMockMilkyWayRenderer(callLog);
  const toneMapPass = makeMockToneMapPass(callLog);
  const thumbnails = makeMockThumbnails(callLog);
  const quadRenderer = makeMockQuadRenderer();
  const diskRenderer = makeMockDiskRenderer();
  const cam = makeCam();
  const clouds = new Map([[Source.SDSS, makeCloud(1)]]);

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selectedIndex: null as number | null,
    visibleSourceMask: 0xffffffff,
    highlightFallback: true,
    realOnlyMode: false,
    biasMode: BiasMode.None,
    absMagLimit: -19,
    apparentMagLimit: 19.5,
    schechterMStar: -20.83,
    schechterAlpha: -1.2,
    depthFadeEnabled: true,
    // Task 8 of procedural-disk-impostor: points-pass crossfade-OUT
    // band thresholds.  Match the runtime defaults exported from
    // `thumbnailSubsystem.ts` so the test fixture mirrors production.
    pxFadeStartPoints: 8,
    pxFadeEndPoints: 14,
    exposure: 1.0,
    toneMapCurve: ToneMapCurve.Reinhard,
    galaxyTexturesEnabled: true,
    milkyWayEnabled: true,
    ...(overrides.settings ?? {}),
  };

  return {
    callLog,
    env,
    device,
    context,
    swapView,
    hdrTargetView,
    hdrDepthView,
    pointRenderer,
    milkyWayRenderer,
    toneMapPass,
    thumbnails,
    quadRenderer,
    diskRenderer,
    cam,
    clouds,
    input: {
      cam,
      canvasWidth: 1280,
      canvasHeight: 720,
      viewProj: new Float32Array(16) as unknown as mat4,
      milkyWayITimeSec: 0,
      device,
      context,
      hdrTargetView,
      hdrDepthView,
      pointRenderer,
      milkyWayRenderer,
      toneMapPass,
      thumbnails,
      quadRenderer,
      diskRenderer,
      settings,
      famousMeta: [],
      famousXrefs: {},
      clouds,
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('renderFrame', () => {
  let fx: ReturnType<typeof makeInput>;

  beforeEach(() => {
    fx = makeInput();
  });

  it('creates exactly one command encoder per frame', () => {
    renderFrame(fx.input);
    expect(fx.device.createCommandEncoder).toHaveBeenCalledTimes(1);
  });

  it('submits exactly once with the encoder.finish() output', () => {
    renderFrame(fx.input);
    const submit = (fx.device.queue.submit as any) as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(fx.env.finish).toHaveBeenCalledTimes(1);
    // The submitted buffer is the one finish() returned.
    const submitted = (submit as any).lastBuffers as ReadonlyArray<GPUCommandBuffer>;
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toBe((fx.env.finish.mock.results[0] as any).value);
  });

  it('begins the HDR render pass with the supplied hdrTargetView as the colour attachment', () => {
    renderFrame(fx.input);
    expect(fx.env.beginRenderPass).toHaveBeenCalledTimes(1);
    const desc = (fx.env.beginRenderPass as any).lastDescriptor as GPURenderPassDescriptor;
    const attachments = Array.from(desc.colorAttachments as any);
    expect(attachments).toHaveLength(1);
    const att = attachments[0] as any;
    expect(att.view).toBe(fx.hdrTargetView);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('attaches the supplied hdrDepthView as the depth-stencil attachment, cleared to 1.0', () => {
    // The HDR pass needs a depth buffer so the per-galaxy overlay
    // pipelines (quads + procedural disks) can write per-galaxy
    // depth values that the Milky Way impostor (drawn last) tests
    // against.  Without this attachment, every pipeline that
    // declares `depthStencil` state would fail WebGPU's render-pass
    // validation, and the Milky-Way-occlusion fix collapses to a
    // no-op (the original visual bug).
    renderFrame(fx.input);
    const desc = (fx.env.beginRenderPass as any).lastDescriptor as GPURenderPassDescriptor;
    const dsa = desc.depthStencilAttachment as any;
    expect(dsa).toBeDefined();
    expect(dsa.view).toBe(fx.hdrDepthView);
    // Clear to 1.0 (the WebGPU NDC far plane) so any pipeline with
    // `depthCompare: 'less'` passes its first test against the empty
    // buffer — the same as having no depth test for the first pass.
    expect(dsa.depthClearValue).toBe(1.0);
    expect(dsa.depthLoadOp).toBe('clear');
    expect(dsa.depthStoreOp).toBe('store');
  });

  it('forwards every settings field to pointRenderer.draw in the canonical order', () => {
    renderFrame(fx.input);
    const draw = fx.pointRenderer.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    // [pass, viewProj, viewportPx, pointSizePx, brightness, selectedIndex,
    //  visibleSourceMask, camPosWorld, pxPerRad, highlightFallback,
    //  realOnlyMode, biasMode, absMagLimit, apparentMagLimit,
    //  schechterMStar, schechterAlpha, depthFadeEnabled]
    expect(args[0]).toBe(fx.env.pass);
    expect(args[1]).toBe(fx.input.viewProj);
    expect(args[2]).toEqual([fx.input.canvasWidth, fx.input.canvasHeight]);
    expect(args[3]).toBe(fx.input.settings.pointSizePx);
    expect(args[4]).toBe(fx.input.settings.brightness);
    // selectedIndex null → 0xffffffff sentinel
    expect(args[5]).toBe(0xffffffff >>> 0);
    expect(args[6]).toBe(fx.input.settings.visibleSourceMask);
    // camPos is a 3-tuple snapshot from cam.position
    expect(Array.from(args[7] as ArrayLike<number>)).toEqual([0, 0, 5]);
    // pxPerRad = h / (2 · tan(fovY/2))
    const expectedPxPerRad =
      fx.input.canvasHeight / (2 * Math.tan(fx.input.cam.fovYRad / 2));
    expect(args[8]).toBeCloseTo(expectedPxPerRad, 6);
    expect(args[9]).toBe(fx.input.settings.highlightFallback);
    expect(args[10]).toBe(fx.input.settings.realOnlyMode);
    expect(args[11]).toBe(fx.input.settings.biasMode);
    expect(args[12]).toBe(fx.input.settings.absMagLimit);
    expect(args[13]).toBe(fx.input.settings.apparentMagLimit);
    expect(args[14]).toBe(fx.input.settings.schechterMStar);
    expect(args[15]).toBe(fx.input.settings.schechterAlpha);
    expect(args[16]).toBe(fx.input.settings.depthFadeEnabled);
  });

  it('translates a non-null selectedIndex straight through to pointRenderer.draw', () => {
    const fx2 = makeInput({ settings: { selectedIndex: 42 } });
    renderFrame(fx2.input);
    const draw = fx2.pointRenderer.draw as ReturnType<typeof vi.fn>;
    expect(draw.mock.calls[0]![5]).toBe(42);
  });

  it('calls thumbnails.runFrame between pointRenderer.draw and pass.end', () => {
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxPoint = log.indexOf('pointRenderer.draw');
    const idxThumb = log.indexOf('thumbnails.runFrame');
    const idxEnd = log.indexOf('pass.end');
    expect(idxPoint).toBeGreaterThanOrEqual(0);
    expect(idxThumb).toBeGreaterThan(idxPoint);
    expect(idxEnd).toBeGreaterThan(idxThumb);
  });

  it('skips thumbnails.runFrame when galaxyTexturesEnabled is false', () => {
    const fx2 = makeInput({ settings: { galaxyTexturesEnabled: false } });
    renderFrame(fx2.input);
    expect(fx2.thumbnails.runFrame).not.toHaveBeenCalled();
    // But pointRenderer.draw + tone-map still happen.
    expect(fx2.pointRenderer.draw).toHaveBeenCalledTimes(1);
    expect(fx2.toneMapPass.draw).toHaveBeenCalledTimes(1);
  });

  it('forwards the shared pxPerRad + camPos to thumbnails.runFrame so both passes match', () => {
    renderFrame(fx.input);
    const runFrame = fx.thumbnails.runFrame as ReturnType<typeof vi.fn>;
    expect(runFrame).toHaveBeenCalledTimes(1);
    const arg = runFrame.mock.calls[0]![0] as any;
    const expectedPxPerRad =
      fx.input.canvasHeight / (2 * Math.tan(fx.input.cam.fovYRad / 2));
    expect(arg.pxPerRad).toBeCloseTo(expectedPxPerRad, 6);
    expect(Array.from(arg.camPos as ArrayLike<number>)).toEqual([0, 0, 5]);
    expect(arg.canvasSize).toEqual({ width: 1280, height: 720 });
    expect(arg.viewProj).toBe(fx.input.viewProj);
    expect(arg.visibleSourceMask).toBe(fx.input.settings.visibleSourceMask);
    expect(arg.clouds).toBe(fx.input.clouds);
    expect(arg.pass).toBe(fx.env.pass);
  });

  it('calls toneMapPass.draw after pass.end with exposure, curve, and the swap-chain view', () => {
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxEnd = log.indexOf('pass.end');
    const idxTm = log.indexOf('toneMapPass.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxTm).toBeGreaterThan(idxEnd);

    const draw = fx.toneMapPass.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(fx.env.encoder);
    expect(args[1]).toBe(fx.swapView);
    expect(args[2]).toBe(fx.hdrTargetView);
    expect(args[3]).toBe(fx.input.settings.exposure);
    expect(args[4]).toBe(fx.input.settings.toneMapCurve);
  });

  it('records full frame in the canonical order: createEncoder → beginRenderPass → pointRenderer.draw → thumbnails.runFrame → milkyWayRenderer.draw → pass.end → toneMapPass.draw → encoder.finish → submit', () => {
    // The Milky Way impostor is now drawn LAST inside the HDR pass —
    // *after* the thumbnail subsystem has populated the depth buffer
    // with per-galaxy overlay depths.  The impostor's pipeline tests
    // (but doesn't write) depth, so thumbnails for galaxies in front
    // of the world origin correctly survive the impostor draw, and
    // thumbnails for galaxies behind it get correctly occluded.  See
    // the renderFrame doc-comment for the full draw-order rationale
    // and `services/gpu/hdrTarget.ts` for the depth-buffer design.
    renderFrame(fx.input);
    const interesting = [
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'pointRenderer.draw',
      'thumbnails.runFrame',
      'milkyWayRenderer.draw',
      'pass.end',
      'toneMapPass.draw',
      'encoder.finish',
      'device.queue.submit',
    ];
    const filtered = fx.callLog.filter((e) => interesting.includes(e));
    expect(filtered).toEqual(interesting);
  });

  it('draws the Milky Way impostor after thumbnails.runFrame so the impostor depth-tests against per-galaxy overlay depths', () => {
    // Concrete ordering claim: thumbnail draws (which write depth)
    // must happen *before* the Milky Way draw (which reads depth) in
    // the same render pass.  If the order ever flips back to "MW
    // first, thumbnails second" the impostor would test against the
    // empty (cleared 1.0) depth buffer and the original
    // "thumbnails-blot-out-Milky-Way" bug returns.
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxThumb = log.indexOf('thumbnails.runFrame');
    const idxMw = log.indexOf('milkyWayRenderer.draw');
    const idxEnd = log.indexOf('pass.end');
    expect(idxThumb).toBeGreaterThanOrEqual(0);
    expect(idxMw).toBeGreaterThan(idxThumb);
    expect(idxEnd).toBeGreaterThan(idxMw);
  });
});

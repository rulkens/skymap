/**
 * renderFrame — unit tests for the per-frame WebGPU command-encoder
 * dispatcher.  We mock the GPU device, the command encoder, the render
 * pass, and every renderer/subsystem the function calls, so the test
 * runs without a real WebGPU context.
 *
 * Coverage focus:
 *   - encoder lifecycle: createCommandEncoder + finish + submit happen
 *     exactly once each, in the right order
 *   - HDR render-pass colour attachment uses the postProcess aggregate's
 *     `view` (HDR offscreen texture)
 *   - pointRenderer.draw is called with all 17 args in the right order
 *     (selectedIndex sentinel translation included)
 *   - thumbnails.runFrame is called between point draw and pass.end —
 *     and skipped when galaxyTexturesEnabled is false
 *   - postProcess.draw is called after pass.end with the correct
 *     exposure + curve uniforms
 *   - the swap-chain view is acquired AFTER pass.end (i.e. when the
 *     tone-map pass needs it), not at frame start
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { BiasMode } from '../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { mat4 } from 'gl-matrix';

// ── Test fixtures ───────────────────────────────────────────────────────────

/**
 * Tracks the chronological order of every interesting call so we can
 * assert ordering relationships (e.g. `pointRenderer.draw` came before
 * `pass.end`, which came before `postProcess.draw`).  The encoder, the
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

/**
 * Mock the combined HDR-target + tone-map aggregate.  The real
 * `PostProcess` exposes `view` (live HDR texture view), `resize`,
 * `draw`, and `destroy`.  We only need a stable view + a spy `draw`
 * that logs into the call log; resize/destroy stay as no-op spies
 * so the surface satisfies the `RenderFrameInput.postProcess` type.
 */
function makeMockPostProcess(callLog: CallLog, hdrView: GPUTextureView) {
  return {
    view: hdrView,
    resize: vi.fn(),
    draw: vi.fn(() => {
      callLog.push('postProcess.draw');
    }),
    destroy: vi.fn(),
  } as any;
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

function makeMockTexturedQuadRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeMockTexturedDiskRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeMockProceduralDiskRenderer() {
  return { draw: vi.fn() } as any;
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

function makeCloud(count = 1): GalaxyCatalog {
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
function makeInput(
  overrides: { settings?: Partial<any>; disabledPasses?: ReadonlySet<string> } = {},
) {
  const callLog: CallLog = [];
  const env = makeEncoderEnv(callLog);
  const device = makeFakeDevice(callLog, env.encoder);
  const swapView = makeFakeSwapView();
  const context = makeFakeContext(swapView, callLog);
  const hdrTargetView = makeFakeHdrView();
  const pointRenderer = makeMockPointRenderer(callLog);
  const milkyWayRenderer = makeMockMilkyWayRenderer(callLog);
  const postProcess = makeMockPostProcess(callLog, hdrTargetView);
  // Minimal VolumeOffscreen stub — renderFrame's existing tests don't
  // exercise the volume pass (volumesEnabled is false by default in
  // makeSettings), so a no-op view is sufficient for fixture satisfaction.
  const volumeOffscreen = { view: {} as GPUTextureView, resize: vi.fn(), destroy: vi.fn() } as any;
  const thumbnails = makeMockThumbnails(callLog);
  const texturedQuadRenderer = makeMockTexturedQuadRenderer();
  const texturedDiskRenderer = makeMockTexturedDiskRenderer();
  const proceduralDiskRenderer = makeMockProceduralDiskRenderer();
  const cam = makeCam();
  const catalogs = new Map([[Source.SDSS, makeCloud(1)]]);

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null as { source: Source; localIdx: number } | null,
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
    filamentsEnabled: false,
    filamentIntensity: 1,
    volumesEnabled: false,
    ...(overrides.settings ?? {}),
  };

  // Build the per-frame derived snapshot in the shape `RenderFrameInput`
  // now expects.  Pre-D.1 these fields lived inline on `input`; today
  // they're consolidated under `input.ctx` (a `ReadyFrameContext`)
  // because `runFrame` derives them once via `deriveFrameContext()` and
  // forwards a single struct.  The test mirrors that production wiring.
  const canvasWidth = 1280;
  const canvasHeight = 720;
  const viewProj = new Float32Array(16) as unknown as mat4;
  const ctx = {
    isReady: true as const,
    cam,
    vp: viewProj,
    canvasSize: { width: canvasWidth, height: canvasHeight },
    drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    drawPxPerRad: canvasHeight / (2 * Math.tan(cam.fovYRad / 2)),
    renderer: pointRenderer,
    postProcess,
    volumeOffscreen,
    texturedDisks: thumbnails,
  };

  return {
    callLog,
    env,
    device,
    context,
    swapView,
    hdrTargetView,
    postProcess,
    pointRenderer,
    milkyWayRenderer,
    thumbnails,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    cam,
    catalogs,
    // Keep these on the fixture root so tests can read them directly
    // without reaching into `input.ctx.*` for every assertion — they
    // mirror the legacy `input.canvasWidth` / `input.viewProj` shape
    // the assertions already expect.
    canvasWidth,
    canvasHeight,
    viewProj,
    input: {
      ctx,
      // D.2 added `state` to RenderFrameInput so passes can read engine
      // state.  The new label + marker-line passes DO read `state.gpu.*`
      // in their `enabled()` gates.  Provide null for both new handles so
      // the passes correctly skip (enabled returns false), which matches the
      // pre-atlas-load behaviour and keeps existing renderFrame tests green.
      state: {
        gpu: { labelRenderer: null, markerLineRenderer: null, selectionRingRenderer: null, scalarVolumeRenderer: null, clusterMarkerRenderer: null },
        // Task 11 split the legacy thumbnails subsystem into three.  The
        // proceduralDisksPass / texturedDisksPass entries each read their
        // slot off `state.subsystems` in their `enabled()` gate; nulling
        // the two subsystem references here makes both passes skip
        // cleanly so the legacy renderFrame
        // assertions continue to focus on point + milky-way ordering.
        subsystems: {
          proceduralDisks: null,
          texturedDisks: null,
          // filamentsPass.enabled now consults the FadeRegistry to
          // keep the pass alive through fade-out tails. Provide a
          // minimal opacityOf stub so the gate doesn't crash.
          fades: { opacityOf: () => 1 },
        },
        // DebugPanel renderer-toggle override bag.  Most tests don't
        // pass any overrides so the default is an empty Set — matches
        // the production default.  Tests that need to assert the
        // skip-on-toggle behaviour pass `overrides.disabledPasses`.
        debug: { disabledPasses: new Set<string>(overrides.disabledPasses ?? []) },
      } as never,
      milkyWayITimeSec: 0,
      device,
      context,
      milkyWayRenderer,
      filamentRenderer: null,
      scalarVolumeRenderer: null,
      texturedQuadRenderer,
      texturedDiskRenderer,
      proceduralDiskRenderer,
      settings,
      famousMeta: [],
      famousXrefs: {},
      catalogs,
      // Disabled stub mirrors the production path (no `?gpuTimings`
      // URL gate) — `service.enabled === false` so renderFrame takes
      // the single-pass branch.  Active-mode behaviour is exercised
      // in `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
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
    const submit = fx.device.queue.submit as any as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(fx.env.finish).toHaveBeenCalledTimes(1);
    // The submitted buffer is the one finish() returned.
    const submitted = (submit as any).lastBuffers as ReadonlyArray<GPUCommandBuffer>;
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toBe((fx.env.finish.mock.results[0] as any).value);
  });

  it("begins the HDR render pass with the postProcess aggregate's view as the colour attachment", () => {
    // No-timing path (`timingService: null` in the fixture) → single
    // mega-pass: one `beginRenderPass(loadOp: 'clear')` block, every
    // enabled HDR pass draws inside it, one `pass.end`.  This is the
    // production shape — required for correctness of the OVER-blended
    // overlay passes on tile-based GPUs.  The split shape (one
    // `beginRenderPass` per pass) only runs when `timingService` is
    // non-null; that path is exercised in `recordHdrSplitPasses.test.ts`.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(1);

    const desc = calls[0]![0];
    const attachments = Array.from(desc.colorAttachments as any);
    expect(attachments).toHaveLength(1);
    const att = attachments[0] as any;
    expect(att.view).toBe(fx.hdrTargetView);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('forwards every settings field to pointRenderer.draw in the canonical order', () => {
    renderFrame(fx.input);
    const draw = fx.pointRenderer.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    // Signature: (pass, viewProj, viewportPx, settings: PointDrawSettings).
    // The 16 trailing scalars from the legacy positional shape now live as
    // named fields on a single object — the per-frame uniform buffer write
    // order inside `pointRenderer.draw` is unchanged, so the assertions
    // here are an object-by-key reshape of the old positional list.
    expect(args[0]).toBe(fx.env.pass);
    expect(args[1]).toBe(fx.viewProj);
    expect(args[2]).toEqual([fx.canvasWidth, fx.canvasHeight]);
    const drawSettings = args[3] as Record<string, unknown>;
    expect(drawSettings.pointSizePx).toBe(fx.input.settings.pointSizePx);
    expect(drawSettings.brightness).toBe(fx.input.settings.brightness);
    // selected null → 0xffffffff packed sentinel
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
    expect(drawSettings.visibleSourceMask).toBe(fx.input.settings.visibleSourceMask);
    // camPos is a 3-tuple snapshot from cam.position
    expect(Array.from(drawSettings.camPosWorld as ArrayLike<number>)).toEqual([0, 0, 5]);
    // pxPerRad = h / (2 · tan(fovY/2))
    const expectedPxPerRad = fx.canvasHeight / (2 * Math.tan(fx.cam.fovYRad / 2));
    expect(drawSettings.pxPerRad as number).toBeCloseTo(expectedPxPerRad, 6);
    expect(drawSettings.highlightFallback).toBe(fx.input.settings.highlightFallback);
    expect(drawSettings.realOnlyMode).toBe(fx.input.settings.realOnlyMode);
    expect(drawSettings.biasMode).toBe(fx.input.settings.biasMode);
    expect(drawSettings.absMagLimit).toBe(fx.input.settings.absMagLimit);
    expect(drawSettings.apparentMagLimit).toBe(fx.input.settings.apparentMagLimit);
    expect(drawSettings.schechterMStar).toBe(fx.input.settings.schechterMStar);
    expect(drawSettings.schechterAlpha).toBe(fx.input.settings.schechterAlpha);
    expect(drawSettings.depthFadeEnabled).toBe(fx.input.settings.depthFadeEnabled);
  });

  it('packs (source, localIdx) into the selectedPacked u32 sent to pointRenderer.draw', () => {
    // SDSS = 1, localIdx = 42 → (1 << 27) | 42 = 0x0800_002a = 134217770.
    const fx2 = makeInput({ settings: { selected: { source: Source.SDSS, localIdx: 42 } } });
    renderFrame(fx2.input);
    const draw = fx2.pointRenderer.draw as ReturnType<typeof vi.fn>;
    const expected = ((Source.SDSS << 27) | 42) >>> 0;
    const drawSettings = draw.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  // Legacy "thumbnails.runFrame" assertions removed in the 2026-05-12
  // impostor-subsystem-split (Tasks 11/12).  The combined `runFrame` call
  // that lived inside the legacy galaxyThumbnailsPass is gone — the LOD-1
  // and LOD-2 plans are now produced by `proceduralDiskSubsystem.runFrame`
  // and `texturedDiskSubsystem.runFrame` upstream in `runFrame.ts`,
  // and the three downstream passes (`proceduralDisksPass`,
  // `texturedQuadsPass`, `texturedDisksPass`) just issue the renderer
  // draws.  The textured halves were split out of the former
  // `texturedDisksPass` on 2026-05-18 so the debug panel can
  // toggle them independently.  Per-pass coverage lives in the
  // matching `passes/<name>Pass.test.ts` files.

  it('calls postProcess.draw after pass.end with exposure, curve, and the swap-chain view', () => {
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxEnd = log.indexOf('pass.end');
    const idxTm = log.indexOf('postProcess.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxTm).toBeGreaterThan(idxEnd);

    // Post-Phase-4 the HDR view is owned by the aggregate, not threaded
    // through the call site — `postProcess.draw(encoder, swapView,
    // exposure, curve)` is the four-arg signature.
    const draw = fx.postProcess.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(fx.env.encoder);
    expect(args[1]).toBe(fx.swapView);
    expect(args[2]).toBe(fx.input.settings.exposure);
    expect(args[3]).toBe(fx.input.settings.toneMapCurve);
  });

  it('records full frame in the canonical order: createEncoder → HDR pass (begin + draws + end) → postProcess.draw → encoder.finish → submit', () => {
    // No-timing path: one `beginRenderPass(loadOp: 'clear')` holds
    // every enabled HDR draw, one `pass.end` closes it, then tone-map
    // + finish + submit.  In this fixture only point-sprites +
    // milky-way fire (the impostor subsystems are nulled out).
    renderFrame(fx.input);
    const interesting = [
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'pointRenderer.draw',
      'milkyWayRenderer.draw',
      'pass.end',
      'postProcess.draw',
      'encoder.finish',
      'device.queue.submit',
    ];
    const filtered = fx.callLog.filter((e) => interesting.includes(e));
    expect(filtered).toEqual([
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'pointRenderer.draw',
      'milkyWayRenderer.draw',
      'pass.end',
      'postProcess.draw',
      'encoder.finish',
      'device.queue.submit',
    ]);
  });

  it('draws the Milky Way impostor after pointRenderer.draw for deterministic crossfade composition', () => {
    // No-timing path: a single HDR pass holds both draws and one
    // `pass.end` closes it.  The semantic invariant we care about is
    // "the HDR pass ends after the milky-way draw and milky-way
    // draws after points" — order matters for the additive crossfade.
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxPoint = log.indexOf('pointRenderer.draw');
    const idxMw = log.indexOf('milkyWayRenderer.draw');
    const idxEnd = log.indexOf('pass.end');
    expect(idxPoint).toBeGreaterThanOrEqual(0);
    expect(idxMw).toBeGreaterThan(idxPoint);
    expect(idxEnd).toBeGreaterThan(idxMw);
  });

  it('opens a pre-HDR render pass against the half-res view when volumes are active', () => {
    // When `volumesEnabled` is true AND scalarVolumeRenderer has active
    // fields, `encodeVolumes` must run BEFORE the HDR mega-pass.  The
    // fixture's default settings has volumesEnabled=false → no pre-pass
    // fires.  We force-enable it here and stub a renderer with an
    // active field, then check that the FIRST beginRenderPass goes
    // against the half-res view.
    const fx2 = makeInput({ settings: { volumesEnabled: true } });
    // Wire in a scalarVolumeRenderer with active fields.
    const drawSpy = vi.fn();
    (fx2.input as any).scalarVolumeRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
    };
    (fx2.input.state as any).gpu.scalarVolumeRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
    };
    // volumeUpsamplePass.enabled gates on volumeUpsample !== null —
    // keep it null so the upsample pass is skipped; this test only
    // cares that the half-res pre-pass fires before the HDR pass.
    (fx2.input.state as any).gpu.volumeUpsample = null;
    // The half-res view comes off ctx.volumeOffscreen.view.  The
    // fixture's mock may not include volumeOffscreen — patch it on.
    const halfResView = { __id: 'half-res' } as unknown as GPUTextureView;
    (fx2.input.ctx as any).volumeOffscreen = { view: halfResView, resize: () => {}, destroy: () => {} };

    renderFrame(fx2.input);

    // The first beginRenderPass should be the half-res pre-pass.
    const calls = (fx2.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const firstAtt = Array.from(calls[0]![0].colorAttachments as any)[0] as any;
    expect(firstAtt.view).toBe(halfResView);
    expect(firstAtt.loadOp).toBe('clear');

    // The renderer was asked to draw inside that pass.
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the pre-HDR half-res pass when volumes are disabled', () => {
    // Default fixture has volumesEnabled=false → only one HDR pass.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(1);
  });

  it('skips a pass whose name appears in state.debug.disabledPasses', () => {
    // The DebugPanel's `RenderTogglesSection` flips entries in/out of
    // `state.debug.disabledPasses` via the `passOverrides` handle.  The
    // encoder loop in `encodeHdrSingle` checks the set after the pass's
    // own `enabled()` gate — toggling `point-sprites` off should stop
    // `pointRenderer.draw` from firing even though every other input
    // (settings, source mask, …) would normally cause it to run.
    const fx2 = makeInput({ disabledPasses: new Set(['point-sprites']) });
    renderFrame(fx2.input);
    expect(fx2.pointRenderer.draw).not.toHaveBeenCalled();
    // Milky-way still draws — the override is per-pass, not global.
    expect(fx2.milkyWayRenderer.draw).toHaveBeenCalledTimes(1);
  });
});

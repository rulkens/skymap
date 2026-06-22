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
 *   - pointRenderer.draw is called with the canonical settings record
 *     (selectedIndex sentinel translation included)
 *   - postProcess.draw is called after pass.end with the correct
 *     exposure + curve uniforms
 *   - the swap-chain view is acquired AFTER pass.end (i.e. when the
 *     tone-map pass needs it), not at frame start
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { mat4 } from 'gl-matrix';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';

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
 * Build a fresh encoder + render-pass pair for one frame. The encoder
 * spies stash their last descriptor / finished buffer on themselves so
 * tests can assert post-call state without globals. Returned as a struct
 * so the fixture can also reach the inner `pass` and raw `vi.fn` refs.
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
 * Mock the combined HDR-target + tone-map aggregate. The real
 * `PostProcess` exposes `view`, `resize`, `draw`, and `destroy`. We need
 * a stable view + a spy `draw` that logs into the call log; resize and
 * destroy stay no-op spies to satisfy the type.
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

function makeMockHorizonShellRenderer(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('horizonShellRenderer.draw');
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

/** Build a complete RenderFrameInput fixture with sensible defaults. */
function makeInput(
  overrides: { settings?: Partial<any>; disabledPasses?: Record<string, boolean> } = {},
) {
  const callLog: CallLog = [];
  const env = makeEncoderEnv(callLog);
  const device = makeFakeDevice(callLog, env.encoder);
  const swapView = makeFakeSwapView();
  const context = makeFakeContext(swapView, callLog);
  const hdrTargetView = makeFakeHdrView();
  const pointRenderer = makeMockPointRenderer(callLog);
  const milkyWayRenderer = makeMockMilkyWayRenderer(callLog);
  const horizonShellRenderer = makeMockHorizonShellRenderer(callLog);
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

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null as SelectionRef | null,
    visibleSourceMask: 0xffffffff,
    highlightFallback: true,
    realOnlyMode: false,
    biasMode: BiasMode.None,
    absMagLimit: -19,
    depthFadeEnabled: true,
    // Points-pass crossfade-OUT band thresholds. Match the runtime
    // defaults from `thumbnailSubsystem.ts` so the fixture mirrors
    // production.
    pxFadeStartPoints: 8,
    pxFadeEndPoints: 14,
    focus: { center: [0, 0, 0], apparentRadiusMpc: 0, physicalRadiusMpc: 0, blend: 0 } as const,
    exposure: 1.0,
    toneMapCurve: ToneMapCurve.Reinhard,
    galaxyTexturesEnabled: true,
    milkyWayEnabled: true,
    filamentsEnabled: false,
    filamentIntensity: 1,
    volumesEnabled: false,
    ...(overrides.settings ?? {}),
  };

  // Per-frame derived snapshot under `input.ctx` (a `ReadyFrameContext`):
  // `runFrame` derives these once via `deriveFrameContext()` and forwards
  // a single struct. The test mirrors that wiring.
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
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: { center: [0, 0, 0] as Readonly<[number, number, number]>, apparentRadiusMpc: 1, physicalRadiusMpc: 0, blend: 0 },
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
    horizonShellRenderer,
    thumbnails,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    cam,
    // Mirror these on the fixture root so tests read them directly
    // instead of reaching into `input.ctx.*` for every assertion.
    canvasWidth,
    canvasHeight,
    viewProj,
    // Expose the local settings bag so tests can assert against it
    // (e.g. exposure, toneMapCurve) without reaching into input.settings,
    // which no longer exists on RenderFrameInput.
    settings,
    input: {
      ctx,
      // Passes read engine state via `input.state`. The label +
      // marker-line passes read `state.gpu.*` in their `enabled()` gates;
      // nulling those handles makes the passes skip (enabled → false), so
      // these tests stay focused on point + milky-way ordering.
      state: {
        // focusUniform: renderFrame writes it once per frame and
        // pointSpritesPass binds its group; a no-op write + opaque bind
        // group keeps the mock encoder happy.
        gpu: {
          labelRenderer: null,
          markerLineRenderer: null,
          selectionRingRenderer: null,
          volumeFieldRenderer: null,
          flowFieldRenderer: null,
          structureMarkerRenderer: null,
          focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
        },
        // encodeFlowCompute (pre-HDR) reads these; flow is default-off so the
        // gate early-returns once the renderer is null.  A null slot →
        // slotReady false → not loaded.  The encoders read the DebugPanel
        // renderer-toggle override bag off `settings.debug.disabledPasses`:
        // most tests pass no overrides so the default is an empty record (matches
        // production); the skip-on-toggle test passes `overrides.disabledPasses`.
        settings: {
          galaxyCatalogs: {
            sizePx: settings.pointSizePx,
            brightness: settings.brightness,
            highlightFallback: settings.highlightFallback,
            realOnly: settings.realOnlyMode,
            depthFade: settings.depthFadeEnabled,
          },
          tonemap: { exposure: settings.exposure, curve: settings.toneMapCurve },
          bias: { mode: settings.biasMode, absMagLimit: settings.absMagLimit },
          thumbnails: { enabled: settings.galaxyTexturesEnabled },
          milkyWay: { enabled: settings.milkyWayEnabled },
          filaments: { enabled: settings.filamentsEnabled, intensity: settings.filamentIntensity },
          volumes: { enabled: settings.volumesEnabled },
          flow: { enabled: false },
          debug: { disabledPasses: overrides.disabledPasses ?? {} },
        },
        selection: { select: settings.selected },
        assetSlots: { flow: null },
        // pointSpritesPass stashes the packed uniform bytes onto
        // state.picking.lastFrameUniformBytes after each draw so the pick
        // paths can snapshot the last frame's camera state.  The bag must
        // exist; all other fields are at their default 'nothing in flight'
        // values — only lastFrameUniformBytes is mutated by the pass.
        picking: {
          lastFrameUniformBytes: null as ArrayBuffer | null,
          pickInFlight: false,
          pointerDown: false,
        },
        // proceduralDisksPass / texturedDisksPass each read their slot
        // off `state.subsystems` in their `enabled()` gate; nulling both
        // references makes the passes skip cleanly.
        subsystems: {
          proceduralDisks: null,
          texturedDisks: null,
          // filamentsPass.enabled consults the FadeRegistry to keep the
          // pass alive through fade-out tails. A minimal opacityOf stub
          // keeps the gate from crashing.
          fades: { opacityOf: () => 1 },
        },
      } as never,
      milkyWayITimeSec: 0,
      device,
      context,
      milkyWayRenderer,
      horizonShellRenderer,
      filamentRenderer: null,
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      texturedQuadRenderer,
      texturedDiskRenderer,
      proceduralDiskRenderer,
      // Disabled stub (`service.enabled === false`) → renderFrame takes
      // the single-pass branch. Active-mode behaviour lives in
      // `renderFrame.timing.test.ts`.
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
    // No-timing path → single mega-pass: one
    // `beginRenderPass(loadOp: 'clear')` block holds every enabled HDR
    // draw, closed by one `pass.end`. This is the production shape,
    // required for OVER-blended overlay passes on tile-based GPUs. The
    // split shape (one `beginRenderPass` per pass) runs only when
    // `timingService` is non-null — see `recordHdrSplitPasses.test.ts`.
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
    // The scalars are named fields on a single settings object.
    expect(args[0]).toBe(fx.env.pass);
    expect(args[1]).toBe(fx.viewProj);
    expect(args[2]).toEqual([fx.canvasWidth, fx.canvasHeight]);
    const drawSettings = args[3] as Record<string, unknown>;
    expect(drawSettings.pointSizePx).toBe(fx.settings.pointSizePx);
    expect(drawSettings.brightness).toBe(fx.settings.brightness);
    // selected null → 0xffffffff packed sentinel
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
    expect(drawSettings.visibleSourceMask).toBe(fx.settings.visibleSourceMask);
    // camPos is a 3-tuple snapshot from cam.position
    expect(Array.from(drawSettings.camPosWorld as ArrayLike<number>)).toEqual([0, 0, 5]);
    // pxPerRad = h / (2 · tan(fovY/2))
    const expectedPxPerRad = fx.canvasHeight / (2 * Math.tan(fx.cam.fovYRad / 2));
    expect(drawSettings.pxPerRad as number).toBeCloseTo(expectedPxPerRad, 6);
    expect(drawSettings.highlightFallback).toBe(fx.settings.highlightFallback);
    expect(drawSettings.realOnlyMode).toBe(fx.settings.realOnlyMode);
    expect(drawSettings.biasMode).toBe(fx.settings.biasMode);
    expect(drawSettings.absMagLimit).toBe(fx.settings.absMagLimit);
    expect(drawSettings.depthFadeEnabled).toBe(fx.settings.depthFadeEnabled);
  });

  it('packs (source, index) into the selectedPacked u32 sent to pointRenderer.draw', () => {
    // SDSS = 1, index = 42 → (1 << 27) | 42 = 0x0800_002a = 134217770.
    const fx2 = makeInput({
      settings: {
        selected: {
          type: 'galaxyCatalog',
          source: Source.SDSS,
          index: 42,
        } as SelectionRef,
      },
    });
    renderFrame(fx2.input);
    const draw = fx2.pointRenderer.draw as ReturnType<typeof vi.fn>;
    const expected = ((Source.SDSS << 27) | 42) >>> 0;
    const drawSettings = draw.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  // Disk/thumbnail draws are produced by `proceduralDiskSubsystem.runFrame`
  // and `texturedDiskSubsystem.runFrame` upstream; the downstream passes
  // just issue renderer draws. Per-pass coverage lives in the matching
  // `passes/<name>Pass.test.ts` files.

  it('calls postProcess.draw after pass.end with exposure, curve, and the swap-chain view', () => {
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxEnd = log.indexOf('pass.end');
    const idxTm = log.indexOf('postProcess.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxTm).toBeGreaterThan(idxEnd);

    // The aggregate owns the HDR view, so the signature is
    // `postProcess.draw(encoder, swapView, exposure, curve)`.
    const draw = fx.postProcess.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(fx.env.encoder);
    expect(args[1]).toBe(fx.swapView);
    expect(args[2]).toBe(fx.settings.exposure);
    expect(args[3]).toBe(fx.settings.toneMapCurve);
  });

  it('records full frame in the canonical order: createEncoder → HDR pass (begin + draws + end) → postProcess.draw → encoder.finish → submit', () => {
    // No-timing path: one `beginRenderPass(loadOp: 'clear')` holds every
    // enabled HDR draw, one `pass.end` closes it, then tone-map + finish
    // + submit. Here only point-sprites + milky-way fire (the impostor
    // subsystems are nulled out).
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
    // A single HDR pass holds both draws. The invariant: the pass ends
    // after the milky-way draw and milky-way draws after points — order
    // matters for the additive crossfade.
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
    // When `state.settings.volumes.enabled` is true AND volumeFieldRenderer
    // has active fields, `encodeVolumes` must run BEFORE the HDR mega-pass.
    // The fixture's default state has volumes.enabled=false → no pre-pass
    // fires.  We force-enable it here and stub a renderer with an active
    // field, then check that the FIRST beginRenderPass goes against the
    // half-res view.
    const fx2 = makeInput({ settings: { volumesEnabled: true } });
    // Wire in a volumeFieldRenderer with active fields.
    const drawSpy = vi.fn();
    (fx2.input as any).volumeFieldRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
    };
    (fx2.input.state as any).gpu.volumeFieldRenderer = {
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
    (fx2.input.ctx as any).volumeOffscreen = {
      view: halfResView,
      resize: () => {},
      destroy: () => {},
    };

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

  it('skips a pass whose name appears in settings.debug.disabledPasses', () => {
    // The DebugPanel flips entries in/out of `settings.debug.disabledPasses`.
    // The encoder loop in `encodeHdrSingle` checks the record after the
    // pass's own `enabled()` gate, so mapping `point-sprites` to true stops
    // `pointRenderer.draw` even though every other input would run it.
    const fx2 = makeInput({ disabledPasses: { 'point-sprites': true } });
    renderFrame(fx2.input);
    expect(fx2.pointRenderer.draw).not.toHaveBeenCalled();
    // Milky-way still draws — the override is per-pass, not global.
    expect(fx2.milkyWayRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('does not skip a pass whose name maps to false in disabledPasses', () => {
    // `[name] === false` means enabled — only `=== true` hides a pass.
    const fx2 = makeInput({ disabledPasses: { 'point-sprites': false } });
    renderFrame(fx2.input);
    expect(fx2.pointRenderer.draw).toHaveBeenCalledTimes(1);
  });
});

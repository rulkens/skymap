/**
 * renderFrame — verify timing service is consulted per pass.
 *
 * Stubs renderFrame's dependencies, attaches a mock timingService,
 * runs one frame, then asserts:
 *
 *   1. `beginFrame` was called once.
 *   2. `descriptorFor(pass.name)` was called once per enabled HDR
 *      pass.  In this fixture only point-sprites + milky-way fire
 *      (the other six pass slots are gated off via null subsystems /
 *      null optional renderers), so we expect `descriptorFor` to be
 *      called with 'point-sprites' and 'milky-way'.
 *   3. The descriptor returned by the mock landed on the
 *      `timestampWrites` field of the corresponding `beginRenderPass`
 *      call — the orchestrator's `...(timestampWrites ? { ... } : {})`
 *      spread must materialise the field when the service is active.
 *   4. `endFrame` was called once with the encoder.
 *   5. When `state.gpu.timingService` is null (the common case), none
 *      of `beginFrame` / `descriptorFor` / `endFrame` fire and the
 *      encoder commands stay byte-identical to the pre-timing path.
 *      The visual-baseline test in `tests/visual/renderFrameSplitBaseline.test.ts`
 *      backs up the byte-identical claim with a snapshot; this test
 *      asserts the structural "no-call" invariant.
 *
 * ### Why a local helper instead of importing renderFrame.test.ts's
 *
 * Per the Task-9 plan note: keep the fixture local to this test
 * (no shared module extraction in this task).  The shape mirrors
 * `tests/visual/renderFrameSplitBaseline.test.ts`'s `makeMinimalInput`
 * — encoder + pass stubs that record what they were called with,
 * renderers that no-op, and a `state` that gates every optional
 * pass off so the trace stays focused on the two always-on passes
 * (point-sprites + milky-way).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { COSMO } from '../../../../src/services/engine/frame/slabs';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import type { RenderFrameInput } from '../../../../src/@types/engine/frame/RenderFrameInput';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

// ── Mock timing service ────────────────────────────────────────────────────
//
// `descriptorFor` returns a *distinct* descriptor per slot so we can
// assert "the descriptor for slot X landed on pass X's beginRenderPass
// descriptor" — not merely "some descriptor landed".  We tag the stub
// querySet with the slot name (`{ _stub: slot }`) so the assertion can
// dereference back to the calling slot.

function makeFakeTimingService() {
  const beginFrame = vi.fn(() => ({ frameIndex: 0, stagingSlot: 0 as const }));
  const descriptorFor = vi.fn((slot: TimingSlotName) => ({
    querySet: { _stub: slot } as unknown as GPUQuerySet,
    beginningOfPassWriteIndex: 100,
    endOfPassWriteIndex: 101,
  }));
  const endFrame = vi.fn();
  const subscribe = vi.fn(() => () => {});
  const destroy = vi.fn();
  const svc: GpuTimingService = {
    enabled: true,
    beginFrame,
    descriptorFor,
    endFrame,
    subscribe,
    destroy,
  };
  return { svc, beginFrame, descriptorFor, endFrame };
}

// ── WebGPU mock fabricators ────────────────────────────────────────────────

type Beg = { kind: 'beginRenderPass'; desc: GPURenderPassDescriptor };

function makeFakeRenderPass() {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeEncoderEnv() {
  const pass = makeFakeRenderPass();
  const beginCalls: Beg[] = [];
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    beginCalls.push({ kind: 'beginRenderPass', desc });
    return pass;
  });
  const finish = vi.fn(() => ({}) as GPUCommandBuffer);
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  return { encoder, pass, beginCalls };
}

function makeFakeDevice(encoder: GPUCommandEncoder) {
  return {
    createCommandEncoder: vi.fn(() => encoder),
    queue: { submit: vi.fn() },
  } as unknown as GPUDevice;
}

function makeFakeContext(): GPUCanvasContext {
  return {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({}) as GPUTextureView),
    })),
  } as unknown as GPUCanvasContext;
}

function makeLoggingRenderer() {
  return { draw: vi.fn(), render: vi.fn() };
}

/**
 * Mock the offscreen render-target table. The backing `views` record is
 * shared by reference so a test can swap the volume row's view.
 */
function makeRenderTargets(views: Record<string, GPUTextureView>) {
  return {
    specs: [
      { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
      { id: 'volume', format: 'rgba16float', depth: null, scale: 3 },
      { id: 'swap', format: 'bgra8unorm', depth: null, scale: 1 },
    ],
    viewOf: (id: string) => {
      const view = views[id];
      if (!view) throw new Error(`mock renderTargets: no view for '${id}'`);
      return view;
    },
    resize: vi.fn(),
    destroy: vi.fn(),
  };
}

// Fixture camera optics — the ctx built in makeMinimalInputWithTiming()
// mirrors these.
const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: at this distance
// the disc's apparent diameter is twice MILKY_WAY_FADE_FULL_PX under the
// fixture optics, so milkyWayFadeAlpha is 1 by construction and the
// milky-way pass registers its timing slot. A visual-gate re-tune of the
// fade band moves this distance instead of silently dropping the slot.
const MW_ALIVE_DIST_MPC =
  (2 * MILKY_WAY_RADIUS_MPC * (FIXTURE_CANVAS_HEIGHT_PX / (2 * Math.tan(FIXTURE_FOV_Y_RAD / 2)))) /
  (2 * MILKY_WAY_FADE_FULL_PX);

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: MW_ALIVE_DIST_MPC,
    yaw: 0,
    pitch: 0,
    fovYRad: FIXTURE_FOV_Y_RAD,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, MW_ALIVE_DIST_MPC]),
  } as unknown as OrbitCamera;
}

/**
 * Build a minimal RenderFrameInput where only point-sprites and
 * milky-way passes are enabled.  Every other optional renderer / slot
 * is null so its pass's `enabled()` gate reports false.
 */
function makeMinimalInputWithTiming(timingService: GpuTimingService): {
  input: RenderFrameInput;
  beginCalls: Beg[];
  encoder: GPUCommandEncoder;
  device: GPUDevice;
  renderTargetViews: Record<string, GPUTextureView>;
} {
  const env = makeEncoderEnv();
  const device = makeFakeDevice(env.encoder);
  const context = makeFakeContext();
  const pointRenderer = makeLoggingRenderer();
  const milkyWayCloudRenderer = makeLoggingRenderer();
  const horizonShellRenderer = makeLoggingRenderer();
  const proceduralDiskRenderer = makeLoggingRenderer();
  const texturedDiskRenderer = makeLoggingRenderer();
  const renderTargetViews: Record<string, GPUTextureView> = {
    hdr: { __id: 'hdr-view' } as unknown as GPUTextureView,
    volume: { __id: 'volume-view' } as unknown as GPUTextureView,
  };
  const renderTargets = makeRenderTargets(renderTargetViews);

  const cam = makeCam();
  const canvasWidth = 1280;
  const canvasHeight = FIXTURE_CANVAS_HEIGHT_PX;
  const viewProj = new Float32Array(16) as unknown as Mat4;
  // The HDR encoders resolve one SlabView (COSMO) before the layer loop
  // via `slabViewOf(ctx, COSMO)`, which indexes `ctx.slabs[COSMO]`
  // directly — this fixture needs a real row there.
  const cosmoSlab: Slab = {
    index: COSMO,
    nearMpc: 0.01,
    farMpc: 50000,
    vp: Float64Array.from(viewProj as unknown as Float32Array),
    originRelative: false,
    precision: 'f32',
  };

  const ctx = {
    isReady: true as const,
    cam,
    vp: viewProj,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: canvasWidth, height: canvasHeight },
    drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    drawPxPerRad: canvasHeight / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    fovYRad: FIXTURE_FOV_Y_RAD,
    renderer: pointRenderer,
    renderTargets,
    // texturedDisks slot is referenced from frameContext shape;
    // we'll null the matching subsystem on `state` so the pass skips.
    texturedDisks: null,
  } as never;

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null as { source: SourceType; localIdx: number } | null,
    visibleSourceMask: 0xffffffff,
    highlightFallback: true,
    realOnlyMode: false,
    biasMode: BiasMode.None,
    absMagLimit: -19,
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
  };

  const input: RenderFrameInput = {
    ctx,
    state: {
      gpu: {
        labelRenderer: null,
        markerLineRenderer: null,
        debugLineRenderer: null,
        selectionRingRenderer: null,
        volumeFieldRenderer: null,
        flowFieldRenderer: null,
        structureMarkerRenderer: null,
        // Near-field handles null → the (hdr, NEAR0) star-point render, the
        // foreground:0 render, and the NEAR0 caption render all select
        // nothing, and the foreground:0→swap composite is
        // touched-set-skipped, so the near-field steps bill no timing slot.
        // This fixture stays a pure cosmological-frame timing trace
        // (point-sprites, milky-way, hdr→swap).
        earthRenderer: null,
        starRenderer: null,
        planetRenderer: null,
        starPointRenderer: null,
        orbitTrailRenderer: null,
        foregroundLabelRenderer: null,
        // milkyWayLayer.draw reads the generated cloud buffers off this handle.
        milkyWayCloud: {
          buffers: () => ({ starBuf: {}, starCount: 0, dustBuf: null, dustCount: 0 }),
        },
        // Every `ContentLayer.draw` reads its renderer straight off
        // `state.gpu.*` — this is the ONLY place these mock instances are
        // wired in (no top-level `input.*` duplication).
        milkyWayCloudRenderer,
        horizonShellRenderer,
        texturedDiskRenderer,
        proceduralDiskRenderer,
        filamentRenderer: null,
        // The FRAME program's hdr→swap composite reads state.gpu.compositor.
        compositor: { label: 'compositor', draw: vi.fn(), destroy: vi.fn() },
        focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
      },
      // encodeFlowCompute (pre-HDR) reads these; default-off → gate returns.
      // A null slot → slotReady false → not loaded.
      // The encoders read the renderer-toggle override bag off
      // `settings.debug.disabledPasses`; empty by default so no pass is skipped.
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
        volumes: { enabled: settings.volumesEnabled, items: {} },
        flow: { enabled: false },
        debug: { disabledPasses: {} },
      },
      selection: { select: settings.selected },
      assetSlots: { flow: null },
      // Pick-throttle bag; the content passes don't touch it, but the
      // engine-state shape carries it.
      picking: {
        pickInFlight: false,
        pointerDown: false,
      },
      subsystems: {
        proceduralDisks: null,
        texturedDisks: null,
        // filamentsLayer.enabled consults the FadeRegistry to keep the
        // layer alive through fade-out tails. This fixture wants the
        // layer GATED OFF (the test asserts only point-sprites +
        // milky-way fire), so opacityOf returns 0 — no fade-out tail.
        fades: { opacityOf: () => 0 },
      },
    } as never,
    device,
    context,
    timingService,
  };

  return {
    input,
    beginCalls: env.beginCalls,
    encoder: env.encoder,
    device,
    renderTargetViews,
  };
}

describe('renderFrame — timing service hookup', () => {
  it('calls beginFrame once, descriptorFor per enabled layer + composite, and endFrame with the encoder', () => {
    const { svc, beginFrame, descriptorFor, endFrame } = makeFakeTimingService();
    const { input, beginCalls, encoder } = makeMinimalInputWithTiming(svc);

    renderFrame(input);

    // beginFrame fires exactly once per frame.
    expect(beginFrame).toHaveBeenCalledTimes(1);

    // 'perLayerTimed' strategy: descriptorFor fires once per enabled layer
    // (its own timed pass) PLUS once for the hdr→swap composite. In this
    // fixture the enabled HDR layers are point-sprites + milky-way (the others
    // are gated off via null subsystems / null optional renderers; the horizon
    // shell's fade-in band starts at cosmological distances, and
    // MW_ALIVE_DIST_MPC is the close framing that lights the Milky-Way
    // impostor). There is NO 'tone-map' or 'ui-overlay' slot anymore — the
    // tone-map is the 'hdr→swap' composite, and with no swap layer enabled no
    // swap pass opens.
    const slotsCalled = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slotsCalled).toContain('point-sprites');
    expect(slotsCalled).toContain('milky-way');
    expect(slotsCalled).toContain('hdr→swap');
    expect(slotsCalled).not.toContain('ui-overlay');
    expect(slotsCalled).not.toContain('tone-map');
    expect(descriptorFor).toHaveBeenCalledTimes(3);

    // Every opened pass carries its slot's timestampWrites — the first HDR
    // layer's pass carries the clear AND its own descriptor (no dedicated
    // clear pass in the unified path), so all three begins are tagged. The
    // composite's beginRenderPass is opened by the executor (against the swap
    // view), so — unlike the old inline tone-map blit — it DOES appear here.
    expect(beginCalls).toHaveLength(3);
    const stubSlots = beginCalls.map((b) => {
      const tw = (
        b.desc as GPURenderPassDescriptor & {
          timestampWrites?: GPURenderPassTimestampWrites;
        }
      ).timestampWrites;
      expect(tw).toBeDefined();
      return (tw!.querySet as unknown as { _stub: TimingSlotName })._stub;
    });
    expect(stubSlots).toEqual(['point-sprites', 'milky-way', 'hdr→swap']);

    // endFrame fires once with the live encoder so the resolve + copy
    // commands ride the same submit as the HDR draws.
    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(endFrame.mock.calls[0]![1]).toBe(encoder);
  });

  it('skips all timing calls when timingService is disabled', () => {
    const { input, beginCalls, device } = makeMinimalInputWithTiming(
      createDisabledGpuTimingService(),
    );

    expect(() => renderFrame(input)).not.toThrow();

    // The encoder lifecycle still runs end-to-end.
    expect(device.createCommandEncoder).toHaveBeenCalled();

    // Crucially: no beginRenderPass descriptor carries a
    // `timestampWrites` field — the disabled-mode path doesn't
    // attach any.
    for (const b of beginCalls) {
      const desc = b.desc as GPURenderPassDescriptor & {
        timestampWrites?: GPURenderPassTimestampWrites;
      };
      expect(desc.timestampWrites).toBeUndefined();
    }
  });

  it('bills the volume raymarch pass against the scalar-volume slot when timings are active', () => {
    const { svc, descriptorFor } = makeFakeTimingService();
    const { input, beginCalls, renderTargetViews } = makeMinimalInputWithTiming(svc);

    // Force volumes on with an active volumeFieldRenderer. The scalar-volume
    // layer gates on `deriveVolumeLiveness`, which reads the renderer straight
    // off `state.gpu.volumeFieldRenderer`.
    (input.state as any).settings.volumes = { enabled: true, items: {} };
    const drawSpy = vi.fn();
    (input.state as any).gpu.volumeFieldRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
      listIds: () => [],
    };
    // The volume render step resolves its attachment via
    // ctx.renderTargets.viewOf('volume'); swap the backing row.
    const halfView = { __id: 'half' } as unknown as GPUTextureView;
    renderTargetViews.volume = halfView;
    // volume-upsample draw self-guards on a null volumeUpsample; null it so the
    // upsample layer draws nothing (its enabled() still tracks the same gate).
    (input.state as any).gpu.volumeUpsample = null;

    renderFrame(input);

    const slots = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slots).toContain('scalar-volume');
    // The volume render step precedes the hdr step, and there is no dedicated
    // clear pass in the unified path, so the volume pass is the FIRST
    // beginRenderPass (index 0) — carrying the scalar-volume descriptor.
    const preDesc = beginCalls[0]!.desc as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(preDesc.timestampWrites).toBeDefined();
    const tag = (preDesc.timestampWrites!.querySet as unknown as { _stub: string })._stub;
    expect(tag).toBe('scalar-volume');
  });
});

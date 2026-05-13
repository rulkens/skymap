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
import type { mat4 } from 'gl-matrix';
import { Source } from '../../../../src/data/sources';
import { BiasMode } from '../../../../src/data/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import type { RenderFrameInput } from '../../../../src/@types/engine/frame/RenderFrameInput';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { PointCloud } from '../../../../src/@types/data/PointCloud';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';

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
    available: true,
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

function makePostProcess() {
  return {
    view: { __id: 'hdr-view' } as unknown as GPUTextureView,
    resize: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  };
}

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

function makeCloud(count: number): PointCloud {
  const fill = (v: number): Float32Array => {
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

/**
 * Build a minimal RenderFrameInput where only point-sprites and
 * milky-way passes are enabled.  Every other optional renderer / slot
 * is null so its pass's `enabled()` gate reports false.
 */
function makeMinimalInputWithTiming(timingService: GpuTimingService | null): {
  input: RenderFrameInput;
  beginCalls: Beg[];
  encoder: GPUCommandEncoder;
  device: GPUDevice;
  postProcessDraw: ReturnType<typeof vi.fn>;
} {
  const env = makeEncoderEnv();
  const device = makeFakeDevice(env.encoder);
  const context = makeFakeContext();
  const pointRenderer = makeLoggingRenderer();
  const milkyWayRenderer = makeLoggingRenderer();
  const proceduralDiskRenderer = makeLoggingRenderer();
  const texturedQuadRenderer = makeLoggingRenderer();
  const texturedDiskRenderer = makeLoggingRenderer();
  const postProcess = makePostProcess();

  const cam = makeCam();
  const clouds = new Map([[Source.SDSS, makeCloud(1)]]);
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
    // texturedImpostors slot is referenced from frameContext shape;
    // we'll null the matching subsystem on `state` so the pass skips.
    texturedImpostors: null,
  } as never;

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
        scalarVolumeRenderer: null,
      },
      subsystems: {
        proceduralDisks: null,
        texturedImpostors: null,
      },
    } as never,
    milkyWayITimeSec: 0,
    device,
    context,
    milkyWayRenderer: milkyWayRenderer as never,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    texturedQuadRenderer: texturedQuadRenderer as never,
    texturedDiskRenderer: texturedDiskRenderer as never,
    proceduralDiskRenderer: proceduralDiskRenderer as never,
    settings: settings as never,
    famousMeta: [],
    famousXrefs: {},
    clouds,
    timingService,
  };

  return {
    input,
    beginCalls: env.beginCalls,
    encoder: env.encoder,
    device,
    postProcessDraw: postProcess.draw,
  };
}

describe('renderFrame — timing service hookup', () => {
  it('calls beginFrame once, descriptorFor per enabled pass, and endFrame with the encoder', () => {
    const { svc, beginFrame, descriptorFor, endFrame } = makeFakeTimingService();
    const { input, beginCalls, encoder } = makeMinimalInputWithTiming(svc);

    renderFrame(input);

    // beginFrame fires exactly once per frame.
    expect(beginFrame).toHaveBeenCalledTimes(1);

    // descriptorFor fires once per enabled HDR pass PLUS once for the
    // tone-map pass.  In this fixture the HDR side is point-sprites +
    // milky-way (the other six are gated off via null subsystems /
    // null optional renderers); the tone-map slot is unconditional
    // because postProcess.draw is always invoked once per frame.
    const slotsCalled = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slotsCalled).toContain('point-sprites');
    expect(slotsCalled).toContain('milky-way');
    expect(slotsCalled).toContain('tone-map');
    expect(descriptorFor).toHaveBeenCalledTimes(3);

    // The descriptors returned by the mock must land on the
    // beginRenderPass descriptors.  Each pass's beginRenderPass call
    // should carry the timestampWrites for its slot — we match via
    // the `_stub` tag we embedded in the mock's querySet.
    //
    // The first beginRenderPass call is the dedicated clear pass; it
    // never carries timestampWrites (no slot for it).  Every
    // subsequent call corresponds to an enabled HDR sub-pass.
    const subPassBegins = beginCalls.slice(1);
    expect(subPassBegins).toHaveLength(2);
    const stubSlotsOnDescriptors = subPassBegins.map((b) => {
      const tw = (b.desc as GPURenderPassDescriptor & {
        timestampWrites?: GPURenderPassTimestampWrites;
      }).timestampWrites;
      expect(tw).toBeDefined();
      return (tw!.querySet as unknown as { _stub: TimingSlotName })._stub;
    });
    expect(stubSlotsOnDescriptors).toEqual(['point-sprites', 'milky-way']);

    // The clear pass at index 0 must have NO timestampWrites field.
    const clearDesc = beginCalls[0]!.desc as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(clearDesc.timestampWrites).toBeUndefined();

    // endFrame fires once with the live encoder so the resolve + copy
    // commands ride the same submit as the HDR draws.
    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(endFrame.mock.calls[0]![1]).toBe(encoder);
  });

  it('skips all timing calls when timingService is null', () => {
    const { input, beginCalls, device } = makeMinimalInputWithTiming(null);

    expect(() => renderFrame(input)).not.toThrow();

    // The encoder lifecycle still runs end-to-end.
    expect(device.createCommandEncoder).toHaveBeenCalled();

    // Crucially: no beginRenderPass descriptor carries a
    // `timestampWrites` field — the optional-spread `...(tw ? { tw } : {})`
    // pattern must produce byte-identical descriptors to the
    // pre-timing path.
    for (const b of beginCalls) {
      const desc = b.desc as GPURenderPassDescriptor & {
        timestampWrites?: GPURenderPassTimestampWrites;
      };
      expect(desc.timestampWrites).toBeUndefined();
    }
  });
});

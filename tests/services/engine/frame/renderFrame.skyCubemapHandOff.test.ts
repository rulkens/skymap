/**
 * renderFrame — sky-cubemap runtime hand-off (Task 12's "Name the runtime
 * hand-off" step, built in round 1's fix-up).
 *
 * `executeFrame` and `skyCubemapFaceContext` are both mocked: this file
 * is about the WIRING — renderFrame calling `skyCubemapFaceContext` once per
 * scheduled face with the black hole's eye/face/row-declared size, and
 * threading the resulting map into `executeFrame`'s `skyCubemapFaceContexts`
 * — not the GPU pass machinery `renderFrame.test.ts` already covers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above imports (and above plain top-level
// `const`s) — `vi.hoisted` is the sanctioned escape hatch for a mock fn both
// the factory AND the test body need to reference.
const { executeFrameMock, skyCubemapFaceContextMock } = vi.hoisted(() => ({
  executeFrameMock: vi.fn(),
  skyCubemapFaceContextMock: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/executeFrame', () => ({
  executeFrame: executeFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/skyCubemapFaceContext', () => ({
  skyCubemapFaceContext: skyCubemapFaceContextMock,
}));

import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { SGR_A_STAR_ANCHOR } from '../../../../src/data/bodies/sceneSgrAStar';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';

const ALL_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/** A fresh, never-captured-before `skyCubemapCapture` Resource. */
function makeCaptureRuntime() {
  return {
    lastCapturedAtMs: new Map(),
    frameIndex: 0,
    wasBandActive: false,
    lastSweepCamPosMpc: null,
  };
}

function makeState(): EngineState {
  return {
    gpu: { focusUniform: null },
    settings: {
      tonemap: { exposure: 1, curve: 0 },
      hdr: { enabled: false, knee: 0, headroom: 0 },
      bloom: { enabled: false },
      debug: { renderStrategy: 'auto' },
    },
    cameraRuntime: { skyCubemapCapture: makeCaptureRuntime() },
  } as unknown as EngineState;
}

/** `drawCamPos` at the anchor itself ⇒ distance 0 ⇒ deep inside the lensing band (fullAt = 100 AU). */
function makeCtx(drawCamPos: readonly [number, number, number]): ReadyFrameContext {
  return {
    isReady: true,
    drawCamPos,
    simDays: 0,
    nowMs: 1000,
    focus: {},
    slabs: [],
    renderTargets: {
      specOf: (id: string) => {
        if (id === 'sky-cubemap') return { fixedSizePx: { size: 256, layers: 6 } };
        if (id === 'swap') return { format: 'bgra8unorm' };
        throw new Error(`mock renderTargets: no spec row for '${id}'`);
      },
    },
  } as unknown as ReadyFrameContext;
}

function makeInput(ctx: ReadyFrameContext, state: EngineState) {
  return {
    ctx,
    state,
    device: {
      createCommandEncoder: vi.fn(
        () => ({ finish: vi.fn(() => ({})) }) as unknown as GPUCommandEncoder,
      ),
      queue: { submit: vi.fn() },
    } as unknown as GPUDevice,
    context: {
      getCurrentTexture: () => ({ createView: () => ({}) as GPUTextureView }),
    } as unknown as GPUCanvasContext,
    timingService: createDisabledGpuTimingService(),
  };
}

describe('renderFrame — sky-cubemap runtime hand-off', () => {
  beforeEach(() => {
    executeFrameMock.mockClear();
    skyCubemapFaceContextMock.mockClear();
  });

  it('derives each scheduled face via skyCubemapFaceContext(eye=Sgr A*, faceSizePx=row size) and threads the map into executeFrame', () => {
    const faceCtxByFace = new Map<CubeFace, ReadyFrameContext>();
    skyCubemapFaceContextMock.mockImplementation((input: { face: CubeFace }) => {
      const ctx = { __face: input.face } as unknown as ReadyFrameContext;
      faceCtxByFace.set(input.face, ctx);
      return ctx;
    });

    const ctx = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(ctx, makeState()));

    // Distance 0 from the anchor, first frame ever ⇒ bandJustEngaged ⇒ full sweep.
    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    for (const call of skyCubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({ eyeMpc: SGR_A_STAR_ANCHOR.positionMpc, faceSizePx: 256 });
    }
    expect(skyCubemapFaceContextMock.mock.calls.map((c) => c[0].face).sort()).toEqual([
      ...ALL_FACES,
    ]);

    expect(executeFrameMock).toHaveBeenCalledTimes(1);
    const handedOff = executeFrameMock.mock.calls[0]![0].skyCubemapFaceContexts as Map<
      CubeFace,
      ReadyFrameContext
    >;
    expect(handedOff.size).toBe(6);
    for (const face of ALL_FACES) expect(handedOff.get(face)).toBe(faceCtxByFace.get(face));
  });

  it('omits a face from the hand-off map when skyCubemapFaceContext returns null', () => {
    skyCubemapFaceContextMock.mockReturnValue(null);
    const ctx = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(ctx, makeState()));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    const handedOff = executeFrameMock.mock.calls[0]![0].skyCubemapFaceContexts as Map<
      CubeFace,
      ReadyFrameContext
    >;
    expect(handedOff.size).toBe(0);
  });

  it('never calls skyCubemapFaceContext while the lensing band is inactive', () => {
    // Mpc-scale, orders of magnitude past the band's AU-scale goneAt edge.
    const ctx = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(ctx, makeState()));

    expect(skyCubemapFaceContextMock).not.toHaveBeenCalled();
    const handedOff = executeFrameMock.mock.calls[0]![0].skyCubemapFaceContexts as Map<
      CubeFace,
      ReadyFrameContext
    >;
    expect(handedOff.size).toBe(0);
  });
});

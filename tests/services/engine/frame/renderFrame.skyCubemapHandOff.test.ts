/**
 * renderFrame — sky-cubemap runtime hand-off (Task 12's "Name the runtime
 * hand-off" step, built in round 1's fix-up; eye source revised in fix
 * rounds 2 and 3 — see those commits).
 *
 * `executeFrame` and `skyCubemapFaceContext` are both mocked: this file
 * is about the WIRING — renderFrame calling `skyCubemapFaceContext` once per
 * scheduled face with the black hole's eye/face/row-declared size, and
 * threading the resulting map into `executeFrame`'s `skyCubemapFaceContexts`
 * — not the GPU pass machinery `renderFrame.test.ts` already covers. Fix
 * round 3's PINNED-eye tests drive `renderFrame` across two calls sharing one
 * `state` object, since the pin only lives in `cameraRuntime` between frames.
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
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
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
    pinnedEyeMpc: null,
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
      // renderFrame reads the recapture-move threshold off settings —
      // 0.03 matches SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION,
      // the value every threshold assertion below was written against.
      sgrAStarLensingTuning: { skyCubemapRecaptureCameraMoveFraction: 0.03 },
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
      // renderFrame reads the ALLOCATED size, not the spec's
      // `fixedSizePx.size` (a live setting) — see renderFrame.ts's
      // `faceSizePx` derivation.
      sizeOf: (id: string) => {
        if (id === 'sky-cubemap') return { width: 256, height: 256 };
        throw new Error(`mock renderTargets: no allocated size for '${id}'`);
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

  it('derives each scheduled face via skyCubemapFaceContext(eye=camera, faceSizePx=row size) and threads the map into executeFrame', () => {
    const faceCtxByFace = new Map<CubeFace, ReadyFrameContext>();
    skyCubemapFaceContextMock.mockImplementation((input: { face: CubeFace }) => {
      const ctx = { __face: input.face } as unknown as ReadyFrameContext;
      faceCtxByFace.set(input.face, ctx);
      return ctx;
    });

    // Offset 50 AU from the anchor — inside the lensing band (fullAt = 100
    // AU) but NOT at the anchor itself, so a wrong revert to a hole-centred
    // capture (`eyeMpc: SGR_A_STAR_ANCHOR.positionMpc`) is distinguishable
    // from the fix (`eyeMpc: ctx.drawCamPos`) instead of the two coinciding.
    const camPos: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    const ctx = makeCtx(camPos);
    renderFrame(makeInput(ctx, makeState()));

    // First frame ever ⇒ bandJustEngaged ⇒ full sweep.
    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    for (const call of skyCubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({ eyeMpc: camPos, faceSizePx: 256 });
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

  it('round-robin faces reuse the PINNED eye, not the live camera, after a sub-threshold move (fix round 3)', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    const pinnedEye: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    renderFrame(makeInput(makeCtx(pinnedEye), state)); // band entry ⇒ full sweep, pins the eye
    skyCubemapFaceContextMock.mockClear();

    // 0.1 AU move, well under 3% of the ~50 AU distance to Sgr A* (~1.5 AU) —
    // stays a round-robin frame, not a re-pinning full sweep.
    const movedSubThreshold: readonly [number, number, number] = [
      pinnedEye[0] + 0.1 * SCALE_UNITS.AU_TO_MPC,
      pinnedEye[1],
      pinnedEye[2],
    ];
    renderFrame(makeInput(makeCtx(movedSubThreshold), state));

    // Round-robin picks exactly one face; a revert to a live camera eye
    // would hand it `movedSubThreshold`, not the pinned position.
    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(1);
    expect(skyCubemapFaceContextMock.mock.calls[0]![0]).toMatchObject({ eyeMpc: pinnedEye });
  });

  it('a super-threshold move re-pins the eye and forces a full 6-face sweep (fix round 3)', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    const pinnedEye: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    renderFrame(makeInput(makeCtx(pinnedEye), state)); // band entry ⇒ full sweep, pins the eye
    skyCubemapFaceContextMock.mockClear();

    // 10 AU move, well over 3% of the ~60 AU distance to Sgr A* (~1.8 AU).
    const movedBeyondThreshold: readonly [number, number, number] = [
      pinnedEye[0] + 10 * SCALE_UNITS.AU_TO_MPC,
      pinnedEye[1],
      pinnedEye[2],
    ];
    renderFrame(makeInput(makeCtx(movedBeyondThreshold), state));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    for (const call of skyCubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({ eyeMpc: movedBeyondThreshold });
    }
    expect(state.cameraRuntime.skyCubemapCapture.pinnedEyeMpc).toEqual(movedBeyondThreshold);
  });
});

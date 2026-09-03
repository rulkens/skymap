/**
 * renderFrame — sky-cubemap runtime hand-off (Task 12's "Name the runtime
 * hand-off" step; rewritten for the one-shot static bake — see
 * `docs/backlog/2026-09-03-sky-cubemap-static-bake.md`, now removed).
 *
 * `executeFrame` and `skyCubemapFaceContext` are both mocked: this file
 * is about the WIRING — renderFrame calling `skyCubemapFaceContext` once per
 * face on a bake, with the live camera eye and the row-declared size, and
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
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';

const ALL_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/** A fresh, never-baked `skyCubemapCapture` Resource. */
function makeCaptureRuntime() {
  return {
    bandActive: false,
    gcDistanceMpc: Number.POSITIVE_INFINITY,
    bakedFrom: null,
  };
}

function makeState(overrides: Partial<EngineState> = {}): EngineState {
  return {
    gpu: { focusUniform: null },
    settings: {
      tonemap: { exposure: 1, curve: 0 },
      hdr: { enabled: false, knee: 0, headroom: 0 },
      bloom: { enabled: false },
      debug: { renderStrategy: 'auto' },
    },
    selection: { hover: null, select: null, focus: null },
    tier: 'medium',
    subsystems: { fades: { isAnyAnimating: () => false } },
    cameraRuntime: { skyCubemapCapture: makeCaptureRuntime() },
    ...overrides,
  } as unknown as EngineState;
}

/** `drawCamPos` at the anchor itself ⇒ distance 0 ⇒ deep inside the lensing band (fullAt = 100 AU). */
function makeCtx(
  drawCamPos: readonly [number, number, number],
  faceSizePx = 256,
): ReadyFrameContext {
  return {
    isReady: true,
    drawCamPos,
    simDays: 0,
    nowMs: 1000,
    focus: {},
    slabs: [],
    canvasSize: { width: 800, height: 600 },
    renderTargets: {
      reconcile: vi.fn(),
      specOf: (id: string) => {
        if (id === 'sky-cubemap') return { fixedSizePx: { size: faceSizePx, layers: 6 } };
        if (id === 'swap') return { format: 'bgra8unorm' };
        throw new Error(`mock renderTargets: no spec row for '${id}'`);
      },
      // renderFrame reads the ALLOCATED size, not the spec's
      // `fixedSizePx.size` (a live setting) — see renderFrame.ts's
      // `faceSizePx` derivation.
      sizeOf: (id: string) => {
        if (id === 'sky-cubemap') return { width: faceSizePx, height: faceSizePx };
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

  it('derives each face via skyCubemapFaceContext(eye=camera, faceSizePx=row size) and threads the map into executeFrame', () => {
    const faceCtxByFace = new Map<CubeFace, ReadyFrameContext>();
    skyCubemapFaceContextMock.mockImplementation((input: { face: CubeFace }) => {
      const ctx = { __face: input.face } as unknown as ReadyFrameContext;
      faceCtxByFace.set(input.face, ctx);
      return ctx;
    });

    // Offset 50 AU from the anchor — inside the lensing band (fullAt = 100
    // AU), well inside `SKY_CAPTURE_NEAR_MPC`'s complement.
    const camPos: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    const ctx = makeCtx(camPos);
    renderFrame(makeInput(ctx, makeState()));

    // First frame ever ⇒ nothing baked yet ⇒ full sweep.
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

  it('omits a face from the hand-off map when skyCubemapFaceContext returns null, and leaves bakedFrom unset so the next frame retries', () => {
    skyCubemapFaceContextMock.mockReturnValue(null);
    const state = makeState();
    const ctx = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(ctx, state));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    const handedOff = executeFrameMock.mock.calls[0]![0].skyCubemapFaceContexts as Map<
      CubeFace,
      ReadyFrameContext
    >;
    expect(handedOff.size).toBe(0);
    expect(state.cameraRuntime.skyCubemapCapture.bakedFrom).toBeNull();

    // Next frame retries the full sweep, since nothing was ever baked.
    skyCubemapFaceContextMock.mockClear();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
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

  // The sky-cubemap row is lazily allocated off `bandActive`, and the frame
  // that opens the band is the frame that sweeps all six faces — so the row
  // has to be reconciled into existence BEFORE this frame reads it, and
  // reconciled away again when the band closes.
  it('reconciles the render targets on the band edge, and only on the edge', () => {
    const state = makeState();
    const inBand = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(inBand, state));
    expect(inBand.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cameraRuntime.skyCubemapCapture.bandActive).toBe(true);

    // Still in-band: nothing about the row's existence changed.
    const stillInBand = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(stillInBand, state));
    expect(stillInBand.renderTargets.reconcile).not.toHaveBeenCalled();

    const outOfBand = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(outOfBand, state));
    expect(outOfBand.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cameraRuntime.skyCubemapCapture.bandActive).toBe(false);
  });

  it('a second in-band frame with the same state and a moved camera captures nothing', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    const firstEye: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    renderFrame(makeInput(makeCtx(firstEye), state)); // band entry ⇒ full sweep, bakes.
    skyCubemapFaceContextMock.mockClear();
    executeFrameMock.mockClear();

    // Any camera displacement, however large — the content is at infinity,
    // so a moved eye alone must not trigger a re-bake.
    const movedEye: readonly [number, number, number] = [
      firstEye[0] + 10 * SCALE_UNITS.AU_TO_MPC,
      firstEye[1],
      firstEye[2],
    ];
    renderFrame(makeInput(makeCtx(movedEye), state));

    expect(skyCubemapFaceContextMock).not.toHaveBeenCalled();
    const handedOff = executeFrameMock.mock.calls[0]![0].skyCubemapFaceContexts as Map<
      CubeFace,
      ReadyFrameContext
    >;
    expect(handedOff.size).toBe(0);
  });

  it('with a fade ramp animating, a second in-band frame with otherwise unchanged state still sweeps all six faces', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState({
      subsystems: { fades: { isAnyAnimating: () => true } },
    } as Partial<EngineState>);
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes.
    skyCubemapFaceContextMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it('replacing settings with a new (same-content) object triggers a full six-face sweep', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    skyCubemapFaceContextMock.mockClear();

    // Same contents, new reference — mirrors a real store write replacing
    // the settings slice wholesale.
    state.settings = { ...state.settings };
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it("sizeOf('sky-cubemap') returning a different width triggers a full six-face sweep", () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 256), state));
    skyCubemapFaceContextMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 512), state));

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
    for (const call of skyCubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({ faceSizePx: 512 });
    }
  });

  it('band close then re-entry triggers a full six-face sweep', () => {
    skyCubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes.
    renderFrame(makeInput(makeCtx([1000, 0, 0]), state)); // band close ⇒ resets bakedFrom.
    skyCubemapFaceContextMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // re-entry.

    expect(skyCubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });
});

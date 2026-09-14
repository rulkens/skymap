/**
 * renderFrame — the cubemap-capture hand-off, end to end.
 *
 * `executeFrame` and `cubemapFaceContext` are mocked: this file is about the
 * WIRING — `scheduleCubemapCaptures` calling `cubemapFaceContext` once per face
 * on a bake, with the live camera eye and the row-declared size, the scheduled
 * faces reaching the frame program through `captureFaces`, and the contexts
 * reaching `executeFrame` as `captureContexts` — not the GPU pass machinery
 * `renderFrame.test.ts` already covers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above imports (and above plain top-level
// `const`s) — `vi.hoisted` is the sanctioned escape hatch for a mock fn both
// the factory AND the test body need to reference.
const { executeFrameMock, cubemapFaceContextMock, scheduleMock, finishMock } = vi.hoisted(() => ({
  executeFrameMock: vi.fn(),
  cubemapFaceContextMock: vi.fn(),
  scheduleMock: vi.fn(),
  finishMock: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/executeFrame', () => ({
  executeFrame: executeFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/cubemapFaceContext', () => ({
  cubemapFaceContext: cubemapFaceContextMock,
}));
// The real scheduler by default; a test that needs a hand-picked face set
// (fewer than the sky sweep's six) overrides it for one call.
vi.mock('../../../../src/services/engine/frame/scheduleCubemapCaptures', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/services/engine/frame/scheduleCubemapCaptures')
    >();
  scheduleMock.mockImplementation(actual.scheduleCubemapCaptures);
  return { scheduleCubemapCaptures: scheduleMock };
});
vi.mock('../../../../src/services/engine/frame/finishCubemapCapture', () => ({
  finishCubemapCapture: finishMock,
}));

import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { SGR_A_STAR_ANCHOR } from '../../../../src/data/bodies/sceneSgrAStar';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import {
  ALL_CUBE_FACES,
  CUBEMAP_CAPTURES,
  SKY_CAPTURE_KEYS,
} from '../../../../src/data/rendering/cubemapCaptures';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';
import type { CaptureFace } from '../../../../src/@types/engine/frame/CaptureFace';
import type { CaptureFaceContexts } from '../../../../src/@types/engine/frame/CaptureFaceContexts';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { SkyCaptureKey } from '../../../../src/@types/rendering/SkyCaptureKey';

/** Every sky row's target id, so the mock serves whichever row bakes. */
const CAPTURE_TARGET_IDS = SKY_CAPTURE_KEYS.map((key) => CUBEMAP_CAPTURES[key].target);

/** Every program `executeFrame` walked this frame: one per scheduled face, then the frame's own. */
function programs(): readonly (readonly FrameStep[])[] {
  return executeFrameMock.mock.calls.map((call) => call[0].program as readonly FrameStep[]);
}

/** One row's per-face hand-off, as every `executeFrame` call receives it. */
function handedOffContexts(key: SkyCaptureKey = 'sgrAStar'): ReadonlyMap<CubeFace, CaptureFace> {
  const args = executeFrameMock.mock.calls[0]![0] as { captureContexts?: CaptureFaceContexts };
  return args.captureContexts?.get(key) ?? new Map();
}

/**
 * The faces the frame's programs carry capture steps for — the other half of
 * the hand-off, since `captureFaces` reaches `executeFrame` already expanded
 * into steps.
 */
function programFaces(): readonly CubeFace[] {
  const faces = programs()
    .flat()
    .flatMap((step) =>
      step.kind === 'render' && step.capture?.key === 'sgrAStar' ? [step.capture.face] : [],
    );
  return [...new Set(faces)].sort();
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
    subsystems: {
      fades: { isAnyAnimating: () => false },
      texturedDisks: { hasInFlightWork: () => false },
    },
    cubemapCaptures: makeCubemapCaptureRuntimes(),
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
        if (CAPTURE_TARGET_IDS.includes(id))
          return { fixedSizePx: { size: faceSizePx, layers: 6 } };
        if (id === 'swap') return { format: 'bgra8unorm' };
        throw new Error(`mock renderTargets: no spec row for '${id}'`);
      },
      // The sweep reads the ALLOCATED size, not the spec's `fixedSizePx.size`
      // (a live setting) — see `scheduleSkyCaptures`'s `faceSizePx`.
      sizeOf: (id: string) => {
        if (CAPTURE_TARGET_IDS.includes(id)) return { width: faceSizePx, height: faceSizePx };
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

describe('renderFrame — cubemap-capture hand-off', () => {
  beforeEach(() => {
    executeFrameMock.mockClear();
    cubemapFaceContextMock.mockClear();
    scheduleMock.mockClear();
    finishMock.mockClear();
  });

  it('derives each face via cubemapFaceContext(eye=camera, faceSizePx=row size) and threads the map into executeFrame', () => {
    const faceCtxByFace = new Map<CubeFace, ReadyFrameContext>();
    cubemapFaceContextMock.mockImplementation((input: { face: CubeFace }) => {
      const ctx = { __face: input.face } as unknown as ReadyFrameContext;
      faceCtxByFace.set(input.face, ctx);
      return ctx;
    });

    // Offset 50 AU from the anchor — inside the lensing band (fullAt = 100 AU).
    const camPos: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    const ctx = makeCtx(camPos);
    renderFrame(makeInput(ctx, makeState()));

    // First frame ever ⇒ nothing baked yet ⇒ full sweep.
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
    // The near plane and the slot base come off the ROW, not a constant in the
    // scheduler — a second capture row would otherwise inherit the lens's.
    for (const call of cubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({
        eyeMpc: camPos,
        faceSizePx: 256,
        nearMpc: CUBEMAP_CAPTURES.sgrAStar.nearMpc,
        viewSlotBase: CUBEMAP_CAPTURES.sgrAStar.viewSlotBase,
      });
    }
    expect(cubemapFaceContextMock.mock.calls.map((c) => c[0].face).sort()).toEqual([
      ...ALL_CUBE_FACES,
    ]);

    // Six face submissions, then the frame's own.
    expect(executeFrameMock).toHaveBeenCalledTimes(7);
    const handedOff = handedOffContexts();
    expect(handedOff.size).toBe(6);
    for (const face of ALL_CUBE_FACES) {
      expect(handedOff.get(face)?.ctx).toBe(faceCtxByFace.get(face));
    }
    // The same six faces reach the program, off the one map.
    expect(programFaces()).toEqual([...ALL_CUBE_FACES]);
  });

  it("submits each scheduled face in its own command buffer, in program order, before the frame's", () => {
    // Landmine #1 (docs/RENDERER.md): a body renderer rewrites its uniform
    // buffer per draw, so a body drawn for a face and for the view cannot
    // share one submission. Two faces of one row ⇒ two face buffers, each
    // holding only that face's steps, then the frame's — which holds none.
    const face3 = { ctx: makeCtx([1000, 0, 0]), bodySlabs: [] };
    const face5 = { ctx: makeCtx([1000, 0, 0]), bodySlabs: [] };
    scheduleMock.mockReturnValueOnce(
      new Map([
        [
          'sgrAStar',
          new Map<CubeFace, CaptureFace>([
            [3, face3],
            [5, face5],
          ]),
        ],
      ]),
    );
    const input = makeInput(makeCtx([1000, 0, 0]), makeState());
    renderFrame(input);

    const submit = input.device.queue.submit as unknown as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(3);
    expect(input.device.createCommandEncoder).toHaveBeenCalledTimes(3);
    const facesOf = (program: readonly FrameStep[]): readonly (CubeFace | undefined)[] => [
      ...new Set(program.map((step) => (step.kind === 'render' ? step.capture?.face : undefined))),
    ];
    const [first, second, frame] = programs();
    expect(facesOf(first!)).toEqual([3]);
    expect(facesOf(second!)).toEqual([5]);
    expect(frame!.some((step) => step.kind === 'render' && step.capture !== undefined)).toBe(false);
    expect(frame!.length).toBeGreaterThan(0);
    // Each executeFrame call recorded into the encoder submitted right after it.
    const encoders = (input.device.createCommandEncoder as unknown as ReturnType<typeof vi.fn>).mock
      .results;
    executeFrameMock.mock.calls.forEach((call, i) => {
      expect(call[0].encoder).toBe(encoders[i]!.value);
    });
  });

  it('runs finishCubemapCapture once per row that had faces this frame, after its faces', () => {
    // "Had faces" means expanded STEPS: a scheduled row on no capture line
    // (the probe, until its line lands) expands to nothing and owes nothing.
    const face = (): CaptureFace => ({ ctx: makeCtx([1000, 0, 0]), bodySlabs: [] });
    scheduleMock.mockReturnValueOnce(
      new Map([
        ['sgrAStar', new Map<CubeFace, CaptureFace>([[0, face()]])],
        ['solarSystem', new Map<CubeFace, CaptureFace>([[0, face()]])],
        ['probe', new Map<CubeFace, CaptureFace>([[0, face()]])],
      ]),
    );
    const state = makeState();
    const input = makeInput(makeCtx([1000, 0, 0]), state);
    renderFrame(input);

    expect(finishMock.mock.calls.map((call) => call[0])).toEqual(['sgrAStar', 'solarSystem']);
    expect(finishMock).toHaveBeenCalledWith('solarSystem', state, input.device);
    // Both faces' submits precede every finish; the frame's submit follows.
    const submit = input.device.queue.submit as unknown as ReturnType<typeof vi.fn>;
    const submitOrder = submit.mock.invocationCallOrder;
    const finishOrder = finishMock.mock.invocationCallOrder;
    expect(submitOrder).toHaveLength(3);
    expect(Math.max(submitOrder[0]!, submitOrder[1]!)).toBeLessThan(Math.min(...finishOrder));
    expect(Math.max(...finishOrder)).toBeLessThan(submitOrder[2]!);
  });

  it('omits a face from the hand-off map when cubemapFaceContext returns null, and leaves bakedSettings unset so the next frame retries', () => {
    cubemapFaceContextMock.mockReturnValue(null);
    const state = makeState();
    const ctx = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(ctx, state));

    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
    expect(handedOffContexts().size).toBe(0);
    expect(programFaces()).toEqual([]);
    expect(state.cubemapCaptures.sgrAStar.bakedSettings).toBeNull();

    // Next frame retries the full sweep, since nothing was ever baked.
    cubemapFaceContextMock.mockClear();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it('never calls cubemapFaceContext while the lensing band is inactive', () => {
    // Mpc-scale, orders of magnitude past the band's AU-scale goneAt edge.
    const ctx = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(ctx, makeState()));

    expect(cubemapFaceContextMock).not.toHaveBeenCalled();
    expect(handedOffContexts().size).toBe(0);
    expect(programFaces()).toEqual([]);
  });

  // The sky-cubemap row is lazily allocated off `lastBandActive`, and the frame
  // that opens the band is the frame that sweeps all six faces — so the row
  // has to be reconciled into existence BEFORE this frame reads it, and
  // reconciled away again when the band closes.
  it('reconciles the render targets on the band edge, and only on the edge', () => {
    const state = makeState();
    const inBand = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(inBand, state));
    expect(inBand.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cubemapCaptures.sgrAStar.lastBandActive).toBe(true);

    // Still in-band: nothing about the row's existence changed.
    const stillInBand = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(stillInBand, state));
    expect(stillInBand.renderTargets.reconcile).not.toHaveBeenCalled();

    const outOfBand = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(outOfBand, state));
    expect(outOfBand.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cubemapCaptures.sgrAStar.lastBandActive).toBe(false);
  });

  it('a second in-band frame with the same state and a moved camera captures nothing', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    const firstEye: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    renderFrame(makeInput(makeCtx(firstEye), state)); // band entry ⇒ full sweep, bakes.
    cubemapFaceContextMock.mockClear();
    executeFrameMock.mockClear();

    // Any camera displacement, however large — the content is at infinity,
    // so a moved eye alone must not trigger a re-bake.
    const movedEye: readonly [number, number, number] = [
      firstEye[0] + 10 * SCALE_UNITS.AU_TO_MPC,
      firstEye[1],
      firstEye[2],
    ];
    renderFrame(makeInput(makeCtx(movedEye), state));

    expect(cubemapFaceContextMock).not.toHaveBeenCalled();
    expect(handedOffContexts().size).toBe(0);
  });

  it('roster settling (fades animating) forces a sweep every frame, one more on the settle edge, then none once settled', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    let fadesAnimating = true;
    const state = makeState({
      subsystems: {
        fades: { isAnyAnimating: () => fadesAnimating },
        texturedDisks: { hasInFlightWork: () => false },
      },
    } as Partial<EngineState>);

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes (settling).
    cubemapFaceContextMock.mockClear();

    // Still settling, same settings ref ⇒ sweeps again.
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
    cubemapFaceContextMock.mockClear();

    // Settles THIS frame ⇒ one more sweep (the settled bake `bakedSettings` records).
    fadesAnimating = false;
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
    cubemapFaceContextMock.mockClear();

    // Settled, same settings ref ⇒ no further sweep.
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(cubemapFaceContextMock).not.toHaveBeenCalled();
  });

  it('a thumbnail alone still in flight (fades settled) forces a sweep on an otherwise unchanged frame', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState({
      subsystems: {
        fades: { isAnyAnimating: () => false },
        texturedDisks: { hasInFlightWork: () => true },
      },
    } as Partial<EngineState>);
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes.
    cubemapFaceContextMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it('replacing settings with a new (same-content) object triggers a full six-face sweep', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    cubemapFaceContextMock.mockClear();

    // Same contents, new reference — mirrors a real store write replacing
    // the settings slice wholesale.
    state.settings = { ...state.settings };
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it('a row with rebakeOnSettings false bakes on band entry and ignores a settings replacement until the band re-enters', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    // At the Sun: inside `solarSystem`'s band and far outside the lens's, so
    // the only row sweeping here is the once-baked one.
    const atTheSun: readonly [number, number, number] = [0, 0, 0];
    const state = makeState();
    renderFrame(makeInput(makeCtx(atTheSun), state));
    expect(handedOffContexts('solarSystem').size).toBe(6);
    cubemapFaceContextMock.mockClear();

    // The settings write that would re-bake `sgrAStar` leaves this row alone.
    state.settings = { ...state.settings };
    renderFrame(makeInput(makeCtx(atTheSun), state));
    expect(cubemapFaceContextMock).not.toHaveBeenCalled();

    renderFrame(makeInput(makeCtx([1000, 0, 0]), state)); // band close.
    renderFrame(makeInput(makeCtx(atTheSun), state)); // re-entry ⇒ bakes again.
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });

  it('band close then re-entry triggers a full six-face sweep', () => {
    cubemapFaceContextMock.mockImplementation(
      (input: { face: CubeFace }) => ({ __face: input.face }) as unknown as ReadyFrameContext,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes.
    renderFrame(makeInput(makeCtx([1000, 0, 0]), state)); // band close ⇒ resets bakedSettings.
    cubemapFaceContextMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // re-entry.

    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(6);
  });
});

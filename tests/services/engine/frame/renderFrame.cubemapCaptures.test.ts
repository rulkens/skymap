/**
 * renderFrame — the cubemap-capture hand-off, end to end.
 *
 * `executeFrame`, `cubemapCaptureFrame` and `deriveView` are mocked: this
 * file is about the WIRING — `scheduleCubemapCaptures` deriving the row's
 * one frame then calling `deriveView` once per face (via `faceViewSpec`,
 * left real), with the live camera eye and the row-declared size, the
 * scheduled faces reaching the frame program through `captureFaces`, and the
 * contexts reaching `executeFrame` as `captureContexts` — not the GPU pass
 * machinery `renderFrame.test.ts` already covers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above imports (and above plain top-level
// `const`s) — `vi.hoisted` is the sanctioned escape hatch for a mock fn both
// the factory AND the test body need to reference.
const { executeFrameMock, cubemapCaptureFrameMock, deriveViewMock, scheduleMock, finishMock } =
  vi.hoisted(() => ({
    executeFrameMock: vi.fn(),
    cubemapCaptureFrameMock: vi.fn(),
    deriveViewMock: vi.fn(),
    scheduleMock: vi.fn(),
    finishMock: vi.fn(),
  }));
vi.mock('../../../../src/services/engine/frame/executeFrame', () => ({
  executeFrame: executeFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/cubemapCaptureFrame', () => ({
  cubemapCaptureFrame: cubemapCaptureFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/deriveView', () => ({
  deriveView: deriveViewMock,
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
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
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
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { ViewSpec } from '../../../../src/@types/engine/frame/ViewSpec';
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
    // renderFrame looks up VIEW_RIGS[viewRig] for the program to walk.
    viewRig: 'mono',
    // No mesh renderer ⇒ the probe scheduler idles; the sky sweeps are the subject here.
    gpu: { focusUniform: null, meshBodyRenderer: null },
    settings: {
      tonemap: { exposure: 1, curve: 0 },
      hdr: { enabled: false, knee: 0, headroom: 0 },
      bloom: { enabled: false },
      debug: { renderStrategy: 'auto' },
    },
    selection: { hover: null, select: null, focus: null },
    tier: 'medium',
    subsystems: { fades: { isAnyAnimating: () => false } },
    cubemapCaptures: makeCubemapCaptureRuntimes(),
    contentVersion: 0,
    passes: CONTENT_PASSES,
    ...overrides,
  } as unknown as EngineState;
}

/** `drawCamPos` at the anchor itself ⇒ distance 0 ⇒ deep inside the lensing band (fullAt = 100 AU). */
function makeCtx(
  drawCamPos: readonly [number, number, number],
  faceSizePx = 256,
  layers: { awake?: boolean; settling?: boolean } = {},
): FrameView {
  // Frame-owned (`ReadyFrameContext`): `scheduleSkyCaptures` reads these off
  // `ctx.snapshot.x`, so they nest under `snapshot`, not the view's own `ctx.x`.
  const renderTargets = {
    reconcile: vi.fn(),
    specOf: (id: string) => {
      if (CAPTURE_TARGET_IDS.includes(id)) return { fixedSizePx: { size: faceSizePx, layers: 6 } };
      if (id === 'swap') return { format: 'bgra8unorm' };
      throw new Error(`mock renderTargets: no spec row for '${id}'`);
    },
    // The sweep reads the ALLOCATED size, not the spec's `fixedSizePx.size`
    // (a live setting) — see `scheduleSkyCaptures`'s `faceSizePx`.
    sizeOf: (id: string) => {
      if (CAPTURE_TARGET_IDS.includes(id)) return { width: faceSizePx, height: faceSizePx };
      throw new Error(`mock renderTargets: no allocated size for '${id}'`);
    },
  };
  return {
    snapshot: {
      isReady: true,
      layersSettling: layers.settling ?? false,
      simDays: 0,
      nowMs: 1000,
      focus: {},
      renderTargets,
    },
    // renderFrame's `once` sections run against the canvas view itself — mono's
    // views are `[ctx]` itself, so its own set is what a later section reads.
    renderedTargets: new Set<string>(),
    drawCamPos,
    slabs: [],
    canvasSize: { width: 800, height: 600 },
  } as unknown as FrameView;
}

function makeInput(ctx: FrameView, state: EngineState) {
  return {
    canvas: ctx,
    // Mono's own contract: the frame's one view is the canvas itself.
    views: [ctx],
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
    cubemapCaptureFrameMock.mockReset();
    cubemapCaptureFrameMock.mockReturnValue({ isReady: true } as unknown as FrameView);
    deriveViewMock.mockClear();
    scheduleMock.mockClear();
    finishMock.mockClear();
  });

  it('derives one frame via cubemapCaptureFrame(eye=camera), then each face via deriveView(faceViewSpec(faceSizePx=row size)), and threads the map into executeFrame', () => {
    const faceCtxByFace = new Map<CubeFace, FrameView>();
    deriveViewMock.mockImplementation((_snapshot: unknown, _cam: unknown, spec: ViewSpec) => {
      const face = (spec.slot - CUBEMAP_CAPTURES.sgrAStar.viewSlotBase) as CubeFace;
      const ctx = { __face: face } as unknown as FrameView;
      faceCtxByFace.set(face, ctx);
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

    // First frame ever ⇒ nothing baked yet ⇒ full sweep, one frame for the row.
    expect(cubemapCaptureFrameMock).toHaveBeenCalledTimes(1);
    // The near plane comes off the ROW, not a constant in the scheduler — a
    // second capture row would otherwise inherit the lens's.
    expect(cubemapCaptureFrameMock.mock.calls[0]![0]).toMatchObject({
      eyeMpc: camPos,
      nearMpc: CUBEMAP_CAPTURES.sgrAStar.nearMpc,
    });

    // Six faces off that one frame, each stamped with the row's slot base and size.
    expect(deriveViewMock).toHaveBeenCalledTimes(6);
    for (const call of deriveViewMock.mock.calls) {
      const spec = call[2] as ViewSpec;
      expect(spec.sizePx).toEqual({ width: 256, height: 256 });
      expect(spec.slot - CUBEMAP_CAPTURES.sgrAStar.viewSlotBase).toBeGreaterThanOrEqual(0);
    }
    expect(
      deriveViewMock.mock.calls
        .map((c) => (c[2] as ViewSpec).slot - CUBEMAP_CAPTURES.sgrAStar.viewSlotBase)
        .sort((a, b) => a - b),
    ).toEqual([...ALL_CUBE_FACES]);

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
    // Every buffer submitted is one executeFrame call's own encoder, finished.
    const recorded = executeFrameMock.mock.calls.map(
      (call) => (call[0].encoder.finish as ReturnType<typeof vi.fn>).mock.results[0]!.value,
    );
    expect(new Set(recorded).size).toBe(3);
    submit.mock.calls.forEach((call, i) => expect(call[0][0]).toBe(recorded[i]));
  });

  it('runs finishCubemapCapture once per row that had faces this frame, after its faces', () => {
    // "Had faces" means expanded STEPS, one finish per row however many faces
    // it scheduled — and in the order the capture lines run, not the map's.
    const face = (): CaptureFace => ({ ctx: makeCtx([1000, 0, 0]), bodySlabs: [] });
    scheduleMock.mockReturnValueOnce(
      new Map([
        ['probe', new Map<CubeFace, CaptureFace>([[0, face()]])],
        ['sgrAStar', new Map<CubeFace, CaptureFace>([[0, face()]])],
        [
          'solarSystem',
          new Map<CubeFace, CaptureFace>([
            [0, face()],
            [1, face()],
          ]),
        ],
      ]),
    );
    const state = makeState();
    const input = makeInput(makeCtx([1000, 0, 0]), state);
    renderFrame(input);

    expect(finishMock.mock.calls.map((call) => call[0])).toEqual([
      'sgrAStar',
      'solarSystem',
      'probe',
    ]);
    expect(finishMock).toHaveBeenCalledWith('solarSystem', state, input.device);
    // Every face's submit precedes every finish; the frame's submit follows.
    const submit = input.device.queue.submit as unknown as ReturnType<typeof vi.fn>;
    const submitOrder = submit.mock.invocationCallOrder;
    const finishOrder = finishMock.mock.invocationCallOrder;
    expect(submitOrder).toHaveLength(5);
    expect(Math.max(...submitOrder.slice(0, 4))).toBeLessThan(Math.min(...finishOrder));
    expect(Math.max(...finishOrder)).toBeLessThan(submitOrder[4]!);
  });

  it('omits every face from the hand-off map when cubemapCaptureFrame is not ready, and leaves bakedSettings unset so the next frame retries', () => {
    cubemapCaptureFrameMock.mockReturnValue({ isReady: false } as unknown as FrameView);
    const state = makeState();
    const ctx = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(ctx, state));

    expect(cubemapCaptureFrameMock).toHaveBeenCalledTimes(1);
    expect(deriveViewMock).not.toHaveBeenCalled();
    expect(handedOffContexts().size).toBe(0);
    expect(programFaces()).toEqual([]);
    expect(state.cubemapCaptures.sgrAStar.bakedSettings).toBeNull();

    // Next frame retries the full sweep, since nothing was ever baked.
    cubemapCaptureFrameMock.mockClear();
    cubemapCaptureFrameMock.mockReturnValue({ isReady: false } as unknown as FrameView);
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(cubemapCaptureFrameMock).toHaveBeenCalledTimes(1);
  });

  it('never calls deriveView while the lensing band is inactive', () => {
    // Mpc-scale, orders of magnitude past the band's AU-scale goneAt edge.
    const ctx = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(ctx, makeState()));

    expect(deriveViewMock).not.toHaveBeenCalled();
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
    expect(inBand.snapshot.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cubemapCaptures.sgrAStar.lastBandActive).toBe(true);

    // Still in-band: nothing about the row's existence changed.
    const stillInBand = makeCtx(SGR_A_STAR_ANCHOR.positionMpc);
    renderFrame(makeInput(stillInBand, state));
    expect(stillInBand.snapshot.renderTargets.reconcile).not.toHaveBeenCalled();

    const outOfBand = makeCtx([1000, 0, 0]);
    renderFrame(makeInput(outOfBand, state));
    expect(outOfBand.snapshot.renderTargets.reconcile).toHaveBeenCalledTimes(1);
    expect(state.cubemapCaptures.sgrAStar.lastBandActive).toBe(false);
  });

  it('a second in-band frame with the same state and a moved camera captures nothing', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    const state = makeState();
    const firstEye: readonly [number, number, number] = [
      SGR_A_STAR_ANCHOR.positionMpc[0] + 50 * SCALE_UNITS.AU_TO_MPC,
      SGR_A_STAR_ANCHOR.positionMpc[1],
      SGR_A_STAR_ANCHOR.positionMpc[2],
    ];
    renderFrame(makeInput(makeCtx(firstEye), state)); // band entry ⇒ full sweep, bakes.
    deriveViewMock.mockClear();
    executeFrameMock.mockClear();

    // Any camera displacement, however large — the content is at infinity,
    // so a moved eye alone must not trigger a re-bake.
    const movedEye: readonly [number, number, number] = [
      firstEye[0] + 10 * SCALE_UNITS.AU_TO_MPC,
      firstEye[1],
      firstEye[2],
    ];
    renderFrame(makeInput(makeCtx(movedEye), state));

    expect(deriveViewMock).not.toHaveBeenCalled();
    expect(handedOffContexts().size).toBe(0);
  });

  it('roster settling (fades animating) forces a sweep every frame, one more on the settle edge, then none once settled', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    let fadesAnimating = true;
    const state = makeState({
      subsystems: { fades: { isAnyAnimating: () => fadesAnimating } },
    } as unknown as Partial<EngineState>);

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes (settling).
    deriveViewMock.mockClear();

    // Still settling, same settings ref ⇒ sweeps again.
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(deriveViewMock).toHaveBeenCalledTimes(6);
    deriveViewMock.mockClear();

    // Settles THIS frame ⇒ one more sweep (the settled bake `bakedSettings` records).
    fadesAnimating = false;
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(deriveViewMock).toHaveBeenCalledTimes(6);
    deriveViewMock.mockClear();

    // Settled, same settings ref ⇒ no further sweep.
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    expect(deriveViewMock).not.toHaveBeenCalled();
  });

  it('a Layer alone still settling (fades settled) forces a sweep on an otherwise unchanged frame', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    // A Layer still settling — the vote `runFrame` stamps on the ctx.
    const state = makeState({
      subsystems: { fades: { isAnyAnimating: () => false } },
    } as unknown as Partial<EngineState>);
    const settling = { settling: true };
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 256, settling), state)); // band entry ⇒ bakes.
    deriveViewMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 256, settling), state));

    expect(deriveViewMock).toHaveBeenCalledTimes(6);
  });

  it('a Layer awake forever but never settling (flow) leaves the bake recorded and sweeps once', () => {
    // Flow advects for as long as it is enabled and sits in no capture roster.
    // Reading its keep-alive vote as "still settling" re-baked all six faces
    // EVERY frame for the whole session — the defect this pins.
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    const state = makeState({
      subsystems: { fades: { isAnyAnimating: () => false } },
    } as unknown as Partial<EngineState>);
    const awake = { awake: true };
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 256, awake), state)); // band entry ⇒ bakes.
    expect(state.cubemapCaptures.sgrAStar.bakedSettings).not.toBeNull();
    deriveViewMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc, 256, awake), state));

    expect(deriveViewMock).not.toHaveBeenCalled();
  });

  it('replacing settings with a new (same-content) object triggers a full six-face sweep', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    deriveViewMock.mockClear();

    // Same contents, new reference — mirrors a real store write replacing
    // the settings slice wholesale.
    state.settings = { ...state.settings };
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(deriveViewMock).toHaveBeenCalledTimes(6);
  });

  it('a content-version bump alone triggers a full six-face sweep', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));
    deriveViewMock.mockClear();

    state.contentVersion += 1;
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state));

    expect(deriveViewMock).toHaveBeenCalledTimes(6);
  });

  it('a row with rebakeOnSettings false bakes on band entry and ignores a settings replacement until the band re-enters', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    // At the Sun: inside `solarSystem`'s band and far outside the lens's, so
    // the only row sweeping here is the once-baked one.
    const atTheSun: readonly [number, number, number] = [0, 0, 0];
    const state = makeState();
    renderFrame(makeInput(makeCtx(atTheSun), state));
    expect(handedOffContexts('solarSystem').size).toBe(6);
    deriveViewMock.mockClear();

    // The settings write that would re-bake `sgrAStar` leaves this row alone.
    state.settings = { ...state.settings };
    renderFrame(makeInput(makeCtx(atTheSun), state));
    expect(deriveViewMock).not.toHaveBeenCalled();

    renderFrame(makeInput(makeCtx([1000, 0, 0]), state)); // band close.
    renderFrame(makeInput(makeCtx(atTheSun), state)); // re-entry ⇒ bakes again.
    expect(deriveViewMock).toHaveBeenCalledTimes(6);
  });

  it('band close then re-entry triggers a full six-face sweep', () => {
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({ __face: spec.slot }) as unknown as FrameView,
    );

    const state = makeState();
    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // band entry ⇒ bakes.
    renderFrame(makeInput(makeCtx([1000, 0, 0]), state)); // band close ⇒ resets bakedSettings.
    deriveViewMock.mockClear();

    renderFrame(makeInput(makeCtx(SGR_A_STAR_ANCHOR.positionMpc), state)); // re-entry.

    expect(deriveViewMock).toHaveBeenCalledTimes(6);
  });
});

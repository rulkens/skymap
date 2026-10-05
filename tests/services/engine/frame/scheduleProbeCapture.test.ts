/**
 * scheduleProbeCapture — the one-subject-per-frame pick and its face hand-off.
 *
 * `cubemapCaptureFrame` and `deriveView` are mocked
 * (`renderFrame.cubemapCaptures.test.ts`'s style; `faceViewSpec` stays real):
 * the faces here are about WHICH body, WHERE the eye sits and WHICH body row
 * rides each face — not the synthetic camera itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { cubemapCaptureFrameMock, deriveViewMock } = vi.hoisted(() => ({
  cubemapCaptureFrameMock: vi.fn(),
  deriveViewMock: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/cubemapCaptureFrame', () => ({
  cubemapCaptureFrame: cubemapCaptureFrameMock,
}));
vi.mock('../../../../src/services/engine/frame/deriveView', () => ({
  deriveView: deriveViewMock,
}));

import { scheduleProbeCapture } from '../../../../src/services/engine/frame/scheduleProbeCapture';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { PROBE_REFRESH_INTERVAL_MS } from '../../../../src/data/rendering/probeRefreshIntervalMs';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../../src/data/rendering/cubemapCaptures';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { ViewSpec } from '../../../../src/@types/engine/frame/ViewSpec';

const SIM_DAYS = 0;
const NOW_MS = 100_000;

// A hosted rover (rides Mars's row) and a hostless probe (owns its row).
const CURIOSITY = SCENE_MESH_BODIES.find((body) => body.id === 'curiosity')!;
const VOYAGER = SCENE_MESH_BODIES.find((body) => body.id === 'voyager1')!;
const WHALE = SCENE_MESH_BODIES.find((body) => body.id === 'whale')!;
const PETUNIAS = SCENE_MESH_BODIES.find((body) => body.id === 'petunias')!;

// 600-px viewport, fovY 1 rad, tangent-exact.
const FIXTURE_PX_PER_RAD = 600 / (2 * Math.tan(1 / 2));

/** The camera parked at a body: the partition then resolves it as a mesh. */
function ctxAt(bodyId: string, nowMs = NOW_MS): FrameView {
  const positionMpc = deriveBodyStates(SIM_DAYS).get(bodyId)!.positionMpc;
  return {
    // Frame-owned: `scheduleProbeCapture` and `sceneBodyStates` both read
    // these off `ctx.snapshot.x`.
    snapshot: { simDays: SIM_DAYS, nowMs },
    drawCamPos: positionMpc,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

function makeState(resident: readonly string[]): EngineState {
  return {
    gpu: {
      meshBodyRenderer: { hasMesh: (id: string) => resident.includes(id) },
      texturedBodyRenderer: null,
    },
    data: { bodies: { planets: [], meshBodies: [CURIOSITY, VOYAGER] } },
    cubemapCaptures: makeCubemapCaptureRuntimes(),
  } as unknown as EngineState;
}

/** A face ctx whose slab table carries Mars's body-m row at index 3. */
function faceCtxWithMarsRow(face: CubeFace): FrameView {
  return {
    __face: face,
    slabs: [makeSlab(), makeSlab({ index: 1 }), makeSlab({ index: 2 }), marsSlab(3)],
  } as unknown as FrameView;
}

function marsSlab(index: number) {
  return makeSlab({ index, frame: { kind: 'body-m', hostId: 'mars' as BodyId } });
}

/** `faceViewSpec` is real here — a mocked `deriveView` recovers the face it
 *  turned from the spec's slot, the probe row's only per-face distinguisher. */
function faceOf(spec: ViewSpec): CubeFace {
  return (spec.slot - CUBEMAP_CAPTURES.probe.viewSlotBase) as CubeFace;
}

describe('scheduleProbeCapture', () => {
  beforeEach(() => {
    cubemapCaptureFrameMock.mockReset();
    cubemapCaptureFrameMock.mockReturnValue({ isReady: true } as unknown as FrameView);
    deriveViewMock.mockReset();
    deriveViewMock.mockImplementation((_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
      faceCtxWithMarsRow(faceOf(spec)),
    );
  });

  it('picks the drawn mesh body with the oldest refresh, one per frame', () => {
    const state = makeState(['curiosity', 'voyager1']);
    state.cubemapCaptures.probe.refreshedAtMs.set('curiosity', NOW_MS - 10_000);
    state.cubemapCaptures.probe.refreshedAtMs.set('voyager1', NOW_MS - 20_000);

    // At Curiosity only Curiosity is drawn: it is picked despite Voyager's
    // older refresh, because Voyager is not on this frame's drawn list.
    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity') })).not.toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBe('curiosity');
    expect(state.cubemapCaptures.probe.refreshedAtMs.get('curiosity')).toBe(NOW_MS);

    // A never-refreshed body is older than any refreshed one.
    state.cubemapCaptures.probe.refreshedAtMs.delete('voyager1');
    state.cubemapCaptures.probe.refreshedAtMs.set('curiosity', NOW_MS - 100_000);
    expect(scheduleProbeCapture({ state, ctx: ctxAt('voyager1') })).not.toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBe('voyager1');
    expect(deriveViewMock).toHaveBeenCalledTimes(12);
  });

  it('votes to keep ticking while a second body resolved in the same tick is still due', () => {
    // A paused, still scene wakes for nothing else, so the loser of the tie
    // would sit on a zero cube until the next input.
    const state = makeState(['whale', 'petunias']);
    (state.data.bodies as { meshBodies: unknown }).meshBodies = [WHALE, PETUNIAS];
    const probe = state.cubemapCaptures.probe;

    expect(scheduleProbeCapture({ state, ctx: ctxAt('whale') })).not.toBeNull();
    const first = probe.subject;
    expect(probe.due).toBe(true);

    expect(scheduleProbeCapture({ state, ctx: ctxAt('whale', NOW_MS + 16) })).not.toBeNull();
    expect(probe.subject).not.toBe(first);
    expect(probe.due).toBe(false);
  });

  it('refreshes nothing while every candidate is inside PROBE_REFRESH_INTERVAL_MS', () => {
    const state = makeState(['curiosity']);
    state.cubemapCaptures.probe.refreshedAtMs.set(
      'curiosity',
      NOW_MS - PROBE_REFRESH_INTERVAL_MS + 1,
    );

    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity') })).toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBeNull();
    expect(deriveViewMock).not.toHaveBeenCalled();

    // One millisecond later the interval has elapsed.
    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity', NOW_MS + 1) })).not.toBeNull();
  });

  it("derives one frame at the body's position with the probe row's near plane, and each face at its slot base and face size — resolving the host's body-m slab in the FACE context", () => {
    const state = makeState(['curiosity']);
    const faces = scheduleProbeCapture({ state, ctx: ctxAt('curiosity') });

    expect(faces).not.toBeNull();
    expect([...faces!.keys()].sort()).toEqual([...ALL_CUBE_FACES]);
    const row = CUBEMAP_CAPTURES.probe;
    const curiosityMpc = deriveBodyStates(SIM_DAYS).get('curiosity')!.positionMpc;

    // One frame for the whole row.
    expect(cubemapCaptureFrameMock).toHaveBeenCalledTimes(1);
    expect(cubemapCaptureFrameMock.mock.calls[0]![0]).toMatchObject({
      eyeMpc: curiosityMpc,
      nearMpc: row.nearMpc,
      nowMs: NOW_MS,
      // The cube is captured in the axes the host row shades in.
      axes: deriveBodyStates(SIM_DAYS).get('mars')!.orientation,
    });

    // Six faces off that one frame, each stamped with the row's slot base and size.
    expect(deriveViewMock).toHaveBeenCalledTimes(6);
    for (const call of deriveViewMock.mock.calls) {
      const spec = call[2] as ViewSpec;
      expect(spec.sizePx).toEqual({ width: row.faceSizePx, height: row.faceSizePx });
      expect(spec.slot - row.viewSlotBase).toBeGreaterThanOrEqual(0);
    }
    for (const face of ALL_CUBE_FACES) {
      const scheduled = faces!.get(face)!;
      expect((scheduled.ctx as unknown as { __face: CubeFace }).__face).toBe(face);
      // Mars's row sits at index 3 in the FACE's table (the frame ctx has none).
      expect(scheduled.bodySlabs).toEqual([3]);
    }
  });

  it('derives its frame once for six faces, not once per face', () => {
    const state = makeState(['curiosity']);
    scheduleProbeCapture({ state, ctx: ctxAt('curiosity') });
    expect(cubemapCaptureFrameMock).toHaveBeenCalledTimes(1);
    expect(deriveViewMock).toHaveBeenCalledTimes(ALL_CUBE_FACES.length);
  });

  it("a hostless body's faces carry no body slab", () => {
    // Even a face whose table carries a row for the body itself: the subject
    // must not draw into its own probe.
    deriveViewMock.mockImplementation(
      (_snapshot: unknown, _cam: unknown, spec: ViewSpec) =>
        ({
          __face: faceOf(spec),
          slabs: [
            makeSlab(),
            makeSlab({ index: 1 }),
            makeSlab({ index: 2, frame: { kind: 'body-m', hostId: 'voyager1' as BodyId } }),
          ],
        }) as unknown as FrameView,
    );
    const state = makeState(['voyager1']);
    const faces = scheduleProbeCapture({ state, ctx: ctxAt('voyager1') });

    expect(faces).not.toBeNull();
    for (const face of ALL_CUBE_FACES) expect(faces!.get(face)!.bodySlabs).toEqual([]);
  });

  it('schedules nothing and records no refresh when the row is not ready', () => {
    // Pre-bootstrap only: nothing is recorded, so the next frame retries.
    cubemapCaptureFrameMock.mockReturnValue({ isReady: false } as unknown as FrameView);
    const state = makeState(['curiosity']);

    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity') })).toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBeNull();
    expect(state.cubemapCaptures.probe.refreshedAtMs.has('curiosity')).toBe(false);
    expect(deriveViewMock).not.toHaveBeenCalled();
  });
});

/**
 * scheduleProbeCapture — the one-subject-per-frame pick and its face hand-off.
 *
 * `cubemapFaceContext` is mocked (`renderFrame.cubemapCaptures.test.ts`'s
 * style): the faces here are about WHICH body, WHERE the eye sits and WHICH
 * body row rides each face — not the synthetic camera itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { cubemapFaceContextMock } = vi.hoisted(() => ({ cubemapFaceContextMock: vi.fn() }));
vi.mock('../../../../src/services/engine/frame/cubemapFaceContext', () => ({
  cubemapFaceContext: cubemapFaceContextMock,
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
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

const SIM_DAYS = 0;
const NOW_MS = 100_000;

// A hosted rover (rides Mars's row) and a hostless probe (owns its row).
const CURIOSITY = SCENE_MESH_BODIES.find((body) => body.id === 'curiosity')!;
const VOYAGER = SCENE_MESH_BODIES.find((body) => body.id === 'voyager1')!;

/** The camera parked at a body: the partition then resolves it as a mesh. */
function ctxAt(bodyId: string, nowMs = NOW_MS): ReadyFrameContext {
  const positionMpc = deriveBodyStates(SIM_DAYS).get(bodyId)!.positionMpc;
  return {
    drawCamPos: positionMpc,
    simDays: SIM_DAYS,
    nowMs,
    canvasSize: { width: 800, height: 600 },
    fovYRad: 1,
  } as unknown as ReadyFrameContext;
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
function faceCtxWithMarsRow(face: CubeFace): ReadyFrameContext {
  return {
    __face: face,
    slabs: [makeSlab(), makeSlab({ index: 1 }), makeSlab({ index: 2 }), marsSlab(3)],
  } as unknown as ReadyFrameContext;
}

function marsSlab(index: number) {
  return makeSlab({ index, frame: { kind: 'body-m', bodyId: 'mars' as BodyId } });
}

describe('scheduleProbeCapture', () => {
  beforeEach(() => {
    cubemapFaceContextMock.mockReset();
    cubemapFaceContextMock.mockImplementation(({ face }: { face: CubeFace }) =>
      faceCtxWithMarsRow(face),
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
    expect(cubemapFaceContextMock).toHaveBeenCalledTimes(12);
  });

  it('refreshes nothing while every candidate is inside PROBE_REFRESH_INTERVAL_MS', () => {
    const state = makeState(['curiosity']);
    state.cubemapCaptures.probe.refreshedAtMs.set(
      'curiosity',
      NOW_MS - PROBE_REFRESH_INTERVAL_MS + 1,
    );

    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity') })).toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBeNull();
    expect(cubemapFaceContextMock).not.toHaveBeenCalled();

    // One millisecond later the interval has elapsed.
    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity', NOW_MS + 1) })).not.toBeNull();
  });

  it("derives each face at the body's position with the probe row's near plane, slot base and face size, and resolves the host's body-m slab in the FACE context", () => {
    const state = makeState(['curiosity']);
    const faces = scheduleProbeCapture({ state, ctx: ctxAt('curiosity') });

    expect(faces).not.toBeNull();
    expect([...faces!.keys()].sort()).toEqual([...ALL_CUBE_FACES]);
    const row = CUBEMAP_CAPTURES.probe;
    const curiosityMpc = deriveBodyStates(SIM_DAYS).get('curiosity')!.positionMpc;
    for (const call of cubemapFaceContextMock.mock.calls) {
      expect(call[0]).toMatchObject({
        eyeMpc: curiosityMpc,
        faceSizePx: row.faceSizePx,
        nearMpc: row.nearMpc,
        viewSlotBase: row.viewSlotBase,
        nowMs: NOW_MS,
      });
    }
    for (const face of ALL_CUBE_FACES) {
      const scheduled = faces!.get(face)!;
      expect((scheduled.ctx as unknown as { __face: CubeFace }).__face).toBe(face);
      // Mars's row sits at index 3 in the FACE's table (the frame ctx has none).
      expect(scheduled.bodySlabs).toEqual([3]);
    }
  });

  it("a hostless body's faces carry no body slab", () => {
    // Even a face whose table carries a row for the body itself: the subject
    // must not draw into its own probe.
    cubemapFaceContextMock.mockImplementation(
      ({ face }: { face: CubeFace }) =>
        ({
          __face: face,
          slabs: [
            makeSlab(),
            makeSlab({ index: 1 }),
            makeSlab({ index: 2, frame: { kind: 'body-m', bodyId: 'voyager1' as BodyId } }),
          ],
        }) as unknown as ReadyFrameContext,
    );
    const state = makeState(['voyager1']);
    const faces = scheduleProbeCapture({ state, ctx: ctxAt('voyager1') });

    expect(faces).not.toBeNull();
    for (const face of ALL_CUBE_FACES) expect(faces!.get(face)!.bodySlabs).toEqual([]);
  });

  it('schedules nothing and records no refresh when a face context is null', () => {
    cubemapFaceContextMock.mockImplementation(({ face }: { face: CubeFace }) =>
      face === 4 ? null : faceCtxWithMarsRow(face),
    );
    const state = makeState(['curiosity']);

    expect(scheduleProbeCapture({ state, ctx: ctxAt('curiosity') })).toBeNull();
    expect(state.cubemapCaptures.probe.subject).toBeNull();
    expect(state.cubemapCaptures.probe.refreshedAtMs.has('curiosity')).toBe(false);
  });
});

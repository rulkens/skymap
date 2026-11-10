/**
 * The sky takeover over a real store and saga middleware (spec §5, D11, D13). Only the person's
 * own leave gives the camera and focus back; every other ending (lift-off, a show starting, a
 * hash change) leaves the camera where it stands. A re-entry inherits the first restore. The
 * engine is stood in for by what it would dispatch: `clipEnded` then the end edge's sky commit
 * when the arrival lands, a body commit when the lift-off's clip ends, `clipEnded` when the
 * return flight lands, a centre readout once a far entry's approach looks down at the spot.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../src/data/animation/tours/tourRegistry', async () => {
  const { dwellDrift } = await import('../../../src/state/tour/dwellDrift');
  const beat = { enterClip: { start: 'live', timeline: [] }, dwellClip: dwellDrift(9999) };
  return { tourRegistry: { demo: { id: 'demo', label: 'Demo', beats: [beat] } } };
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { watchZoomLimitSaga } from '../../../src/state/camera/watchZoomLimitSaga';
import { enterSky } from '../../../src/state/sky/enterSky';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { zoomLimitPushed } from '../../../src/state/camera/zoomLimitPushed';
import { startTour } from '../../../src/state/tour/tourActions';
import { clipEnded, clipStarted, commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { engineSkyEntryReported } from '../../../src/state/engine/engineSlice';
import { skySpotAt } from '../../../src/utils/geo/skySpotAt';
import { skySpotRadial } from '../../../src/utils/geo/skySpotRadial';
import { outerBoundRadiusM } from '../../../src/utils/occlusion/outerBoundRadiusM';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { ARRIVAL_GROUND_WAIT_MS } from '../../../src/data/sky/arrivalGroundWaitMs';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { SHORTCUTS_BY_KEY } from '../../../src/state/input/keyboardShortcuts';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { earthArm } from '../../fixtures/earthArm';
import { evaluateFramedClip } from '../../../src/services/engine/camera/clips/evaluateClip';
import { decodeBodyFixedChannels } from '../../../src/services/engine/camera/arms/body/utils/decodeBodyFixedChannels';
import { isBodyArm } from '../../../src/services/engine/camera/arms/body/isBodyArm';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { bodyFixedEyeM } from '../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SKY_RETURN_SEC } from '../../../src/data/sky/skyReturnSec';
import { DEFAULT_FOV_Y_RAD } from '../../../src/services/engine/camera/framing/cameraFraming';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { FramedCameraPose } from '../../../src/@types/camera/pose/FramedCameraPose';
import type { LiveCameraRuntime, RootState } from '../../../src/store/types';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const EARTH = asSceneBodyId('earth');
const MARS_REF = { type: 'body', id: asSceneBodyId('mars') } as const;
const COPENHAGEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
const PARIS: SkySpot = { body: EARTH, lonRad: 0.041, latRad: 0.8527 };
const POINT: Vec3 = [3_500_000, 780_000, 5_260_000];
const ENTRY: FramedCameraPose = earthArm(1.002);
const LIFTED: FramedCameraPose = earthArm(1.5);
const standingAt = (spot: SkySpot): FramedCameraPose => ({
  frame: { sky: spot },
  pose: { azimuthRad: 1, altitudeRad: 0.3 },
});

const RUNTIME: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0.4, pitch: 0.2, distance: 1e-12 },
  fovYRad: 0.8,
  aspect: 16 / 9,
  upBasisQuat: [0, 0, 0, 1],
};

function build() {
  const sagas = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(sagas),
  });
  sagas.setContext({
    cameraRuntime: () => RUNTIME,
    selection: selectionResolverOver({ byId: () => null, byCategory: () => [] }),
    sceneSettled: () => true,
    playClip: () => new Promise<void>(() => {}),
  });
  sagas.run(watchTakeoverSaga);
  sagas.run(watchZoomLimitSaga);
  store.dispatch(commitCameraPose(ENTRY));
  store.dispatch(updateSelectionFocus(MARS_REF, 'cut'));
  return store;
}

const state = (store: ReturnType<typeof build>) => store.getState() as unknown as RootState;

/** The arrival's end: the player's `clipEnded`, then the end edge commits the held sky pose. */
function land(store: ReturnType<typeof build>, spot = COPENHAGEN) {
  store.dispatch(clipEnded());
  store.dispatch(commitCameraPose(standingAt(spot)));
}

function enterAndStand(store: ReturnType<typeof build>, spot = COPENHAGEN) {
  store.dispatch(enterSky({ spot, pointLocalM: POINT }));
  land(store, spot);
}

// A supersede waits for the cancelled run to settle, a promise away.
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Where a return clip's last frame decodes to, against the entry camera's eye and aim. */
function expectLandsOnEntry(clip: ClipData) {
  const bodies = deriveBodyStates(CONST_J2000);
  const opts = { bodies, frameBasis: ORIENTATION_FRAMES.ecliptic, playback: {} };
  const end = evaluateFramedClip(clip, SKY_RETURN_SEC, opts);
  if (!isBodyArm(ENTRY)) throw new Error('fixture: not a body arm');
  expect(end.frame).toEqual(ENTRY.frame);
  const landed = decodeBodyFixedChannels(end.channels, EARTH);
  const eye = bodyFixedEyeM(landed);
  const want = bodyFixedEyeM(ENTRY.pose);
  expect(Math.hypot(eye[0] - want[0], eye[1] - want[1], eye[2] - want[2])).toBeLessThan(1);
  for (const i of [6, 7, 8]) expect(landed.basisLocal[i]).toBeCloseTo(ENTRY.pose.basisLocal[i]!, 9);
}

const lastLeg = (clip: ClipData) => JSON.stringify(clip.timeline.at(-1));

/** The body-frame target the glide (the clip's first leg) ends on. */
function glideTarget(clip: ClipData): Vec3 {
  const first = clip.timeline[0] as { children: { ch?: string; to?: unknown }[] };
  return first.children.find((e) => e.ch === 'target')!.to as Vec3;
}

const offPoint = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the sky takeover', () => {
  it('enters by focusing the spot’s body and playing an arrival that ends standing', () => {
    const store = build();
    store.dispatch(enterSky({ spot: COPENHAGEN, pointLocalM: POINT }));
    const s = state(store);
    expect(selectTakeoverSource(s)).toEqual({
      kind: 'sky',
      spot: COPENHAGEN,
      restore: { base: ENTRY, fovYRad: DEFAULT_FOV_Y_RAD, focus: MARS_REF },
    });
    expect(s.selection.focus).toEqual({ type: 'body', id: EARTH });
    expect(lastLeg(s.camera.clip!.data)).toContain('"sky"');
  });

  it('Leave restores the entry camera and focus', () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(exitTakeover({ restore: true }));
    expect(state(store).selection.focus).toEqual(MARS_REF);
    expect(state(store).camera.clip).not.toBeNull();
    expect(selectTakeoverSource(state(store))?.kind).toBe('sky');

    expectLandsOnEntry(state(store).camera.clip!.data);
    store.dispatch(clipEnded());
    expect(selectTakeoverSource(state(store))).toBeNull();
  });

  it('lift-off ends it without restoring', () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(commitCameraPose(LIFTED));
    expect(selectTakeoverSource(state(store))).toBeNull();
    expect(state(store).camera.base).toEqual(LIFTED);
    expect(state(store).selection.focus).toEqual({ type: 'body', id: EARTH });
  });

  it('a tour start ends it without restoring', async () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(startTour('demo'));
    await flush();
    expect(selectTakeoverSource(state(store))?.kind).toBe('tour');
    expect(state(store).camera.base).toEqual(standingAt(COPENHAGEN));
    expect(state(store).selection.focus).not.toEqual(MARS_REF);
  });

  it('a hash change ends it without restoring (its exit carries no restore)', () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(exitTakeover());
    expect(selectTakeoverSource(state(store))).toBeNull();
    expect(state(store).camera.base).toEqual(standingAt(COPENHAGEN));
    expect(state(store).camera.clip).toBeNull();
  });

  it('re-entry keeps the first restore', async () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(enterSky({ spot: PARIS, pointLocalM: POINT }));
    await flush();
    land(store, PARIS);
    const source = selectTakeoverSource(state(store));
    expect(source).toEqual({
      kind: 'sky',
      spot: PARIS,
      restore: { base: ENTRY, fovYRad: DEFAULT_FOV_Y_RAD, focus: MARS_REF },
    });

    store.dispatch(exitTakeover({ restore: true }));
    expectLandsOnEntry(state(store).camera.clip!.data);
  });

  it('Esc with a card open closes the card and keeps the focus and the takeover', () => {
    const store = build();
    enterAndStand(store);
    store.dispatch(updateSelectionSelect(MARS_REF));
    const first = SHORTCUTS_BY_KEY.escape!.run(state(store));
    expect(first).not.toBeInstanceOf(Array);
    store.dispatch(first as never);
    expect(state(store).selection.select).toBeNull();
    expect(state(store).selection.focus).toEqual({ type: 'body', id: EARTH });
    expect(selectTakeoverSource(state(store))?.kind).toBe('sky');

    expect(SHORTCUTS_BY_KEY.escape!.run(state(store))).toContainEqual(
      exitTakeover({ restore: true }),
    );
  });

  it('a push at the floor enters at the cursor anchor', () => {
    const store = build();
    store.dispatch(zoomLimitPushed({ edge: 'in', body: EARTH, pointLocalM: POINT }));
    const spot = skySpotAt(EARTH, POINT);
    expect(selectTakeoverSource(state(store))).toMatchObject({ kind: 'sky', spot });
    // The glide ends standing on the anchor, not on the datum point under the spot.
    expect(offPoint(glideTarget(state(store).camera.clip!.data), POINT)).toBeLessThan(4);
  });

  it('an arrival another clip replaces ends it without restoring', () => {
    const store = build();
    store.dispatch(enterSky({ spot: COPENHAGEN, pointLocalM: POINT }));
    store.dispatch(clipStarted({ data: { start: 'live', timeline: [] }, frame: 'ecliptic' }));
    expect(selectTakeoverSource(state(store))).toBeNull();
    expect(state(store).selection.focus).toEqual({ type: 'body', id: EARTH });
  });

  it('an arrival stopped short of the sky ends it without restoring', () => {
    const store = build();
    store.dispatch(enterSky({ spot: COPENHAGEN, pointLocalM: POINT }));
    store.dispatch(clipEnded());
    store.dispatch(commitCameraPose(LIFTED));
    expect(selectTakeoverSource(state(store))).toBeNull();
    expect(state(store).camera.base).toEqual(LIFTED);
  });

  describe('a far entry', () => {
    const up = skySpotRadial(COPENHAGEN);
    const GROUND: Vec3 = [up[0] * 6_371_120, up[1] * 6_371_120, up[2] * 6_371_120];
    const readout = (pointLocalM: Vec3) =>
      engineSkyEntryReported({
        spot: skySpotAt(EARTH, pointLocalM),
        pointLocalM,
        altitudeM: 12_000,
      });

    afterEach(() => vi.useRealTimers());

    it('glides to the ground the centre readout names under the spot', () => {
      const store = build();
      store.dispatch(enterSky({ spot: COPENHAGEN, pointLocalM: null }));
      const approach = state(store).camera.clip!.data;
      // A readout far off the spot is not the ground under it.
      store.dispatch(readout(POINT));
      store.dispatch(readout(GROUND));
      store.dispatch(clipEnded());
      const glide = state(store).camera.clip!.data;
      expect(glide).not.toBe(approach);
      expect(offPoint(glideTarget(glide), GROUND)).toBeLessThan(4);
    });

    it('glides to the outer relief bound when no readout comes in 1.5 s', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      const store = build();
      store.dispatch(enterSky({ spot: COPENHAGEN, pointLocalM: null }));
      store.dispatch(clipEnded());
      await vi.advanceTimersByTimeAsync(ARRIVAL_GROUND_WAIT_MS - 1);
      expect(state(store).camera.clip).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      const target = glideTarget(state(store).camera.clip!.data);
      const outer = outerBoundRadiusM(SCENE_CELESTIAL_BODIES.find((b) => b.id === EARTH)!.surface);
      expect(Math.abs(Math.hypot(...target) - outer)).toBeLessThan(4);
    });
  });
});

/**
 * `requestView` over a real store with the clock pinned. Standing at Copenhagen, a fixed target
 * placed at a stated azimuth and altitude must end the head turn there; anything underfoot flies.
 */
import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestViewSaga } from '../../../src/state/selection/watchRequestViewSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../../../src/state/selection/watchRequestSelectSaga';
import { requestView } from '../../../src/state/selection/requestView';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { clipEnded, clipStarted } from '../../../src/state/camera/cameraSlice';
import { engineSkyViewReported } from '../../../src/state/engine/engineSlice';
import { pause, setSimDays } from '../../../src/state/time/timeSlice';
import { selectSkyBelowHorizon } from '../../../src/state/sky/selectSkyBelowHorizon';
import { actionsForPaletteAction } from '../../../src/utils/palette/actionsForPaletteAction';
import { evaluateFramedClip } from '../../../src/services/engine/camera/clips/evaluateClip';
import { foldToWorld } from '../../../src/services/engine/camera/arms/foldToWorld';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { siteEyeFrame } from '../../../src/services/engine/camera/arms/utils/siteEyeFrame';
import { skySpotRadial } from '../../../src/utils/geo/skySpotRadial';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { wrapRad } from '../../../src/utils/math/wrapRad';
import { degToRad } from '../../../src/utils/math/degToRad';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { SKY_LOOK_SEC } from '../../../src/data/sky/skyLookSec';
import { SKY_BELOW_HORIZON_LOOK_RAD } from '../../../src/data/sky/skyBelowHorizonLookRad';
import { selectionRoute } from '../../../src/store/constants';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { SelectionResolver } from '../../../src/@types/engine/selection/SelectionResolver';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { PositionedId } from '../../../src/@types/scene/PositionedId';
import type { RootState } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));
const EARTH = asSceneBodyId('earth');
const COPENHAGEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
const SIM_DAYS = 2461000;
const LENS = 1;
const START_AZ = degToRad(-100);
const BODIES = deriveBodyStates(SIM_DAYS);
const BASIS = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];

/** A galaxy 1 Gpc out, at this azimuth and altitude from Copenhagen at `SIM_DAYS`. */
function targetAt(azimuthRad: number, altitudeRad: number): Vec3 {
  const earth = BODIES.get(EARTH as unknown as PositionedId)!;
  const { east, north, localUp } = siteEyeFrame(skySpotRadial(COPENHAGEN));
  const c = Math.cos(altitudeRad);
  const local = [0, 1, 2].map(
    (i) =>
      c * (Math.sin(azimuthRad) * east[i]! + Math.cos(azimuthRad) * north[i]!) +
      Math.sin(altitudeRad) * localUp[i]!,
  ) as Vec3;
  const dir = rotateVec3ByTightMat3(earth.orientation, local);
  return [0, 1, 2].map((i) => earth.positionMpc[i]! + dir[i]! * 1e3) as Vec3;
}

const ABOVE = { type: 'fixed', positionMpc: targetAt(degToRad(100), degToRad(30)), radiusMpc: 20 };
const BELOW = { type: 'fixed', positionMpc: targetAt(degToRad(100), degToRad(-30)), radiusMpc: 20 };

/** The real resolver, plus two fixed targets under ids of their own. */
function withFixedTargets(real: SelectionResolver): SelectionResolver {
  const rows: Record<string, typeof ABOVE> = { above: ABOVE, below: BELOW };
  return {
    ...real,
    resolveFocusId: (id) => (id in rows ? { type: 'fixed', id } : real.resolveFocusId(id)),
    extractRow: (ref, t) =>
      ref?.type === 'fixed' ? rows[ref.id as string]! : real.extractRow(ref, t),
  };
}

function build() {
  const seen: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g({ serializableCheck: false }).concat(record, mw),
  });
  store.dispatch(setSimDays({ simDays: SIM_DAYS, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));
  const galaxies = { catalogs: new Map() } as unknown as GalaxyRowFixture;
  const structures: StructureRowFixture = { byId: () => null, byCategory: () => [] };
  const ctx = {
    bodies: BODIES,
    poseBasis: BASIS,
    upBasis: BASIS,
    terrainHeightAt: datumOnlyTerrainHeight,
  };
  const standing = { frame: { sky: COPENHAGEN }, pose: { azimuthRad: START_AZ, altitudeRad: 0.3 } };
  mw.setContext({
    selection: withFixedTargets(selectionResolverOver(structures, galaxies)),
    cameraRuntime: () => ({
      from: foldToWorld(standing, ctx),
      fovYRad: LENS,
      aspect: 16 / 9,
      upBasisQuat: [0, 0, 0, 1],
    }),
  });
  for (const saga of [watchRequestViewSaga, watchRequestFocusSaga, watchRequestSelectSaga]) {
    mw.run(saga);
  }
  return { store, seen };
}

function stand(store: ReturnType<typeof build>['store']) {
  store.dispatch(updateSelectionFocus({ type: 'body', id: EARTH }, 'cut'));
  store.dispatch(
    engineSkyViewReported({
      spot: COPENHAGEN,
      azimuthRad: START_AZ,
    }),
  );
}

const lookClip = (seen: UnknownAction[]): ClipData => {
  const started = seen.find(clipStarted.match);
  if (started === undefined) throw new Error('no look clip');
  return started.payload.data;
};
const poseAt = (clip: ClipData, t: number) =>
  evaluateFramedClip(clip, t, { bodies: BODIES, frameBasis: BASIS, playback: {} });
const fovLeg = (clip: ClipData) =>
  JSON.parse(JSON.stringify(clip.timeline)).flatMap(
    (leg: { children: { ch: string; to: number }[] }) =>
      leg.children.filter((c) => c.ch === 'fov').map((c) => c.to),
  );

describe('watchRequestViewSaga', () => {
  it('a palette pick off the ground still selects and flies', async () => {
    const { store, seen } = build();
    for (const action of actionsForPaletteAction({ kind: 'focus', focusId: 'body-mars' })) {
      store.dispatch(action);
    }
    await flush();

    const selection = store.getState()[selectionRoute];
    expect(selection.select).toEqual({ type: 'body', id: 'mars' });
    expect(selection.focus).toEqual({ type: 'body', id: 'mars' });
    expect(seen.find(updateSelectionFocus.match)?.meta).toEqual({ transition: 'fly' });
  });

  it('a pick while standing keeps focus and the sky frame, and turns the short way to it', async () => {
    const { store, seen } = build();
    stand(store);
    store.dispatch(requestView({ id: 'above' }));
    await flush();

    expect(seen.some(requestFocus.match)).toBe(false);
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: EARTH });
    const clip = lookClip(seen);
    const start = poseAt(clip, 0);
    const end = poseAt(clip, SKY_LOOK_SEC);
    expect(end.frame).toEqual({ sky: COPENHAGEN });
    expect(wrapRad(end.channels.yaw - degToRad(100))).toBeCloseTo(0, 6);
    expect(end.channels.pitch).toBeCloseTo(degToRad(30), 6);
    // −100° to 100°: 160° through south, not 200° through north.
    expect(Math.abs(end.channels.yaw - start.channels.yaw)).toBeCloseTo(degToRad(160), 6);
    expect(fovLeg(clip)).toEqual([expect.closeTo(3 * 2 * Math.atan(20 / 1e3), 9)]);
    expect(selectSkyBelowHorizon(store.getState() as unknown as RootState)).toBeNull();
  });

  it('a target below the horizon looks 10° up, keeps the lens, and its rise clears when standing ends', async () => {
    const { store, seen } = build();
    stand(store);
    store.dispatch(requestView({ id: 'below' }));
    await flush();

    const clip = lookClip(seen);
    expect(poseAt(clip, SKY_LOOK_SEC).channels.pitch).toBeCloseTo(SKY_BELOW_HORIZON_LOOK_RAD, 6);
    expect(fovLeg(clip)).toEqual([]);
    const state = () => store.getState() as unknown as RootState;
    expect(selectSkyBelowHorizon(state())).not.toBeNull();
    store.dispatch(engineSkyViewReported(null));
    expect(selectSkyBelowHorizon(state())).toBeNull();
  });

  it('searching the host body flies', async () => {
    const { store, seen } = build();
    stand(store);
    store.dispatch(requestView({ id: 'body-earth' }));
    await flush();

    expect(seen.find(requestFocus.match)?.payload).toEqual({ id: 'body-earth', transition: 'fly' });
    expect(seen.some(clipStarted.match)).toBe(false);
  });

  it('searching Earth during a head turn flies', async () => {
    const { store, seen } = build();
    stand(store);
    store.dispatch(requestView({ id: 'above' }));
    await flush();
    expect(store.getState().camera.clip).not.toBeNull();

    store.dispatch(requestView({ id: 'body-earth' }));
    await flush();
    const ended = seen.findIndex(clipEnded.match);
    const fly = seen.findIndex(requestFocus.match);
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(ended).toBeLessThan(fly);
    expect(store.getState().camera.clip).toBeNull();
  });
});

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
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { engineSkyViewReported } from '../../../src/state/engine/engineSlice';
import { selectSkyBelowHorizon } from '../../../src/state/sky/selectSkyBelowHorizon';
import { skyLookFor } from '../../../src/state/sky/skyLookFor';
import { actionsForPaletteAction } from '../../../src/utils/palette/actionsForPaletteAction';
import { evaluateFramedClip } from '../../../src/services/engine/camera/clips/evaluateClip';
import { foldToWorld } from '../../../src/services/engine/camera/arms/foldToWorld';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { wrapRad } from '../../../src/utils/math/wrapRad';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { SKY_LOOK_SEC } from '../../../src/data/sky/skyLookSec';
import { selectionRoute } from '../../../src/store/constants';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import type { GalaxyRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { PlacedRow } from '../../../src/@types/engine/selection/PlacedRow';
import type { RootState } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));
const EARTH = asSceneBodyId('earth');
const COPENHAGEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
const LENS = 1;

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
  const galaxies = { catalogs: new Map() } as unknown as GalaxyRowFixture;
  const structures: StructureRowFixture = { byId: () => null, byCategory: () => [] };
  const selection = selectionResolverOver(structures, galaxies);
  const simDays = () =>
    deriveSimDays((store.getState() as unknown as RootState).time, performance.now());
  const ctx = () => ({
    bodies: deriveBodyStates(simDays()),
    poseBasis: ORIENTATION_FRAMES.ecliptic,
    upBasis: ORIENTATION_FRAMES.ecliptic,
    terrainHeightAt: datumOnlyTerrainHeight,
  });
  const standing = { frame: { sky: COPENHAGEN }, pose: { azimuthRad: 3, altitudeRad: 0.3 } };
  mw.setContext({
    selection,
    cameraRuntime: () => ({
      from: foldToWorld(standing, ctx()),
      fovYRad: LENS,
      aspect: 16 / 9,
      upBasisQuat: [0, 0, 0, 1],
    }),
  });
  for (const saga of [watchRequestViewSaga, watchRequestFocusSaga, watchRequestSelectSaga]) {
    mw.run(saga);
  }
  return { store, seen, selection, simDays };
}

function stand(store: ReturnType<typeof build>['store']) {
  store.dispatch(updateSelectionFocus({ type: 'body', id: EARTH }, 'cut'));
  store.dispatch(
    engineSkyViewReported({ spot: COPENHAGEN, azimuthRad: 3, altitudeRad: 0.3, fovYRad: LENS }),
  );
}

describe('watchRequestViewSaga', () => {
  it('a palette pick still selects and flies', async () => {
    const { store, seen } = build();
    for (const action of actionsForPaletteAction({ kind: 'focus', focusId: 'body-mars' })) {
      store.dispatch(action);
    }
    await flush();

    const selection = store.getState()[selectionRoute];
    expect(selection.select).toEqual({ type: 'body', id: 'mars' });
    expect(selection.focus).toEqual({ type: 'body', id: 'mars' });
    const focusWrite = seen.find(updateSelectionFocus.match);
    expect(focusWrite?.meta).toEqual({ transition: 'fly' });
  });

  it('a pick while standing keeps focus and the sky frame, and turns the head the short way', async () => {
    const { store, seen, selection, simDays } = build();
    stand(store);
    seen.length = 0;
    for (const action of actionsForPaletteAction({ kind: 'focus', focusId: 'body-mars' })) {
      store.dispatch(action);
    }
    await flush();

    expect(seen.some(requestFocus.match)).toBe(false);
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: EARTH });
    expect(store.getState()[selectionRoute].select).toEqual({ type: 'body', id: 'mars' });
    const started = seen.find(clipStarted.match);
    if (started === undefined) throw new Error('no look clip');
    const clip = started.payload.data;
    const t = simDays();
    const end = evaluateFramedClip(clip, SKY_LOOK_SEC, {
      bodies: deriveBodyStates(t),
      frameBasis: ORIENTATION_FRAMES.ecliptic,
      playback: {},
    });
    expect(end.frame).toEqual({ sky: COPENHAGEN });
    const row = selection.extractRow({ type: 'body', id: asSceneBodyId('mars') }, t) as PlacedRow;
    const look = skyLookFor(row, COPENHAGEN, t, LENS);
    expect(wrapRad(end.channels.yaw - look.azimuthRad)).toBeCloseTo(0, 4);
    // Started from azimuth 3 rad: never more than a half turn.
    expect(Math.abs(end.channels.yaw - 3)).toBeLessThanOrEqual(Math.PI + 1e-9);
    const below = selectSkyBelowHorizon(store.getState() as unknown as RootState);
    expect(below === null).toBe(look.kind === 'look');
  });

  it('searching the host body flies', async () => {
    const { store, seen } = build();
    stand(store);
    seen.length = 0;
    store.dispatch(requestView({ id: 'body-earth' }));
    await flush();

    expect(seen.find(requestFocus.match)?.payload).toEqual({ id: 'body-earth', transition: 'fly' });
    expect(seen.some(clipStarted.match)).toBe(false);
  });
});

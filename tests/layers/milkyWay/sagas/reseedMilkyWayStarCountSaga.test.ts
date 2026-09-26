/**
 * reseedMilkyWayStarCountSaga — every confirmed `setTier` write re-seeds
 * `starCount` from `MILKY_WAY_STARS_PER_TIER[tier]`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { reseedMilkyWayStarCountSaga } from '../../../../src/layers/milkyWay/sagas/reseedMilkyWayStarCountSaga';
import { setTier } from '../../../../src/state/tier/tierSlice';
import { MILKY_WAY_STARS_PER_TIER } from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { TIER_LADDER } from '../../../../src/data/tierLadder';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('reseedMilkyWayStarCountSaga', () => {
  let store: ReturnType<typeof buildStore>;

  function buildStore() {
    const sagaMiddleware = createSagaMiddleware();
    const built = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(reseedMilkyWayStarCountSaga);
    return built;
  }

  beforeEach(() => {
    store = buildStore();
  });

  it.each(TIER_LADDER)(
    're-seeds starCount from MILKY_WAY_STARS_PER_TIER on a %s tier change',
    async (tier) => {
      store.dispatch(setTier(tier));
      await flush();

      expect(store.getState().settings.milkyWay.starCount).toBe(MILKY_WAY_STARS_PER_TIER[tier]);
    },
  );
});

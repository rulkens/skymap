/**
 * reseedMilkyWayStarCountSaga — `starCount` is an absolute count with nothing
 * tying it to the tier automatically, so every confirmed `setTier` write
 * re-seeds it from `MILKY_WAY_STARS_PER_TIER[tier]`.
 */
import { takeEvery, put } from 'typed-redux-saga';

import { setTier } from '../../../../state/tier/tierSlice';
import { setMilkyWayCloudTuning } from '../../state/milkyWay/slice';
import { MILKY_WAY_STARS_PER_TIER } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';

export function* reseedMilkyWayStarCountSaga() {
  yield* takeEvery(setTier, function* (action) {
    yield* put(setMilkyWayCloudTuning({ starCount: MILKY_WAY_STARS_PER_TIER[action.payload] }));
  });
}

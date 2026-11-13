/** watchEnterSkyHereSaga — `enterSkyHere` as an `enterSky` at the centre ground, with its point so the arrival glides. */
import { put, select, takeEvery } from 'typed-redux-saga';

import { enterSkyHere } from './enterSkyHere';
import { enterSky } from './enterSky';
import { selectSkyEntry } from './selectSkyEntry';
import { selectSkyEntryFacts } from './selectSkyEntryFacts';

export function* watchEnterSkyHereSaga() {
  yield* takeEvery(enterSkyHere, function* () {
    const spot = yield* select(selectSkyEntry);
    if (spot === null) return;
    const { pointLocalM } = yield* select(selectSkyEntryFacts);
    yield* put(enterSky({ spot, pointLocalM }));
  });
}

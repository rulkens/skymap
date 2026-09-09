import { all } from 'typed-redux-saga';

import { watchGroupSaga } from '../state/group/watchGroupSaga';
import { watchRegistrySaga } from '../state/registry/watchRegistrySaga';

/** Composes every feature watcher saga — the pose/splat-sort/transform
 *  watchers arrive with plans 2–4. */
export function* mainSaga() {
  yield* all([watchRegistrySaga(), watchGroupSaga()]);
}
